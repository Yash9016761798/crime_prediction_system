'use strict';

/**
 * Crime Intel — Socket.IO real-time server module.
 *
 * Attaches a Socket.IO server to the existing Express HTTP server and handles
 * authenticated real-time events for:
 *   - officer GPS location updates
 *   - officer status updates
 *   - SOS alert create / acknowledge / assign / resolve
 *   - in-app notifications
 *
 * All socket connections are authenticated with the existing JWT. User identity
 * comes from the verified JWT payload, never from an arbitrary client-supplied id.
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config.cjs');

// ---------------------------------------------------------------------------
// Real-time state (mirrors the operational arrays in server.cjs).
// These keep REST and Socket.IO in sync without duplicating persistence logic.
// ---------------------------------------------------------------------------

// officerId -> { officerId, userId, name, role, latitude, longitude, accuracy, trackingMode, timestamp, status }
const officerLocations = new Map();

// socket.id -> { userId, role, name, officerId }
const socketSessions = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidCoord(value) {
  return typeof value === 'number' && Number.isFinite(value) && !isNaN(value);
}

function isValidLatitude(lat) {
  return isValidCoord(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lng) {
  return isValidCoord(lng) && lng >= -180 && lng <= 180;
}

function nowIso() {
  return new Date().toISOString();
}

// Find a registered officer object by id (from the server.cjs officers array).
function findOfficer(officers, id) {
  return officers.find(o => String(o.id) === String(id));
}

// Find the officer record linked to an authenticated user (by userId).
function findOfficerByUserId(officers, userId) {
  return officers.find(o => String(o.userId) === String(userId));
}

// Broadcast to all admin/super_admin/viewer sockets.
function toAdminSockets(io, socketSessions) {
  const sids = [];
  for (const [sid, session] of socketSessions) {
    if (session.role === 'admin' || session.role === 'super_admin' || session.role === 'viewer') {
      sids.push(sid);
    }
  }
  return sids;
}

function emitTo(io, sids, event, payload) {
  for (const sid of sids) {
    io.to(sid).emit(event, payload);
  }
}

// ---------------------------------------------------------------------------
// Module API
// ---------------------------------------------------------------------------

/**
 * Initialize Socket.IO on the existing Express HTTP server.
 *
 * @param {http.Server} httpServer - The Express HTTP server (created by server.cjs).
 * @param {Object} context - Runtime context with access to operational arrays.
 *   context.officers        Array - officer records (mutated in place).
 *   context.sosAlerts       Array - SOS alert records (mutated in place).
 *   context.notifications   Array - notification records (mutated in place).
 *   context.auditLogs       Array - audit log records (mutated in place).
 *   context.users           Array - user records (for identity lookup).
 *   context.persist         Function(keys) - persistence flush callback.
 */
function initSocketIO(httpServer, context = {}) {
  const {
    officers = [],
    sosAlerts = [],
    notifications = [],
    auditLogs = [],
    users = [],
    persist = () => {},
  } = context;

  const io = new Server(httpServer, {
    cors: {
      origin: config.IS_PROD ? config.CORS_ORIGINS : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // -------------------------------------------------------------------------
  // Authentication middleware for every Socket.IO connection.
  // -------------------------------------------------------------------------
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) {
        const authHeader = socket.handshake.headers.authorization || '';
        if (authHeader.toLowerCase().startsWith('bearer ')) {
          token = authHeader.slice(7).trim();
        }
      }
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token, config.JWT_SECRET);

      // Resolve the user from the in-memory users array (demo mode) or database.
      let user = users.find(u => String(u.id) === String(payload.sub));
      if (!user) {
        // Fall back to the database when configured and the user is not in memory.
        try {
          const row = await require('./db.cjs').one('SELECT data FROM users WHERE id = $1', [payload.sub]);
          if (row && row.data) user = row.data;
        } catch (_err) {
          // Database not configured; rely on in-memory lookup above.
        }
      }

      if (!user) {
        return next(new Error('Account no longer exists'));
      }
      if (user.status && user.status !== 'active') {
        return next(new Error('Account is not active'));
      }

      socket.user = {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
      };

      // Link the socket to an officer record when the user is an officer.
      let officerId = null;
      const officer = findOfficerByUserId(officers, user.id);
      if (officer) officerId = officer.id;
      socket.officerId = officerId;

      socketSessions.set(socket.id, {
        userId: user.id,
        role: user.role,
        name: user.name,
        officerId,
      });

      // Join role-based rooms so we can broadcast to admins / officers.
      if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'viewer') {
        socket.join('admins');
      }
      if (user.role === 'officer') {
        socket.join('officers');
      }

      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Session expired'));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Invalid session'));
      }
      return next(new Error(error.message || 'Authentication failed'));
    }
  });

  // -------------------------------------------------------------------------
  // Connection / disconnect
  // -------------------------------------------------------------------------
  io.on('connection', socket => {
    const session = socketSessions.get(socket.id);
    if (!session) return;

    console.log(`[socket] connected ${session.role}:${session.id} (${socket.id})`);

    // Send initial tracking snapshot to newly connected admins.
    if (session.role === 'admin' || session.role === 'super_admin' || session.role === 'viewer') {
      const snapshot = {
        officerLocations: [...officerLocations.values()],
        officers: officers.map(o => ({
          id: o.id,
          name: o.name,
          badgeNumber: o.badgeNumber,
          status: o.status,
          district: o.district,
          currentLocation: o.currentLocation,
        })),
        ts: nowIso(),
      };
      socket.emit('tracking:initial', snapshot);
    }

    // When an officer connects, announce they are online (if they have a location).
    if (session.role === 'officer' && session.officerId) {
      const loc = officerLocations.get(session.officerId);
      if (loc) {
        io.to('admins').emit('officer:location:updated', {
          officerId: loc.officerId,
          userId: loc.userId,
          name: loc.name,
          location: { latitude: loc.latitude, longitude: loc.longitude },
          accuracy: loc.accuracy,
          trackingMode: loc.trackingMode,
          timestamp: loc.timestamp,
          status: loc.status,
        });
      }
    }

    // ---------------------------------------------------------------------
    // officer:location:update
    // ---------------------------------------------------------------------
    socket.on('officer:location:update', (payload, callback) => {
      const handler = async () => {
        if (session.role !== 'officer') {
          throw new Error('Only officers can update location');
        }
        if (!session.officerId) {
          throw new Error('No officer record linked to this account');
        }
        const { latitude, longitude, accuracy, trackingMode = 'live', timestamp } = payload || {};

        if (!isValidLatitude(latitude)) {
          throw new Error('Invalid latitude (must be -90 to 90)');
        }
        if (!isValidLongitude(longitude)) {
          throw new Error('Invalid longitude (must be -180 to 180)');
        }

        const officer = findOfficer(officers, session.officerId);
        if (!officer) {
          throw new Error('Officer not found');
        }

        const loc = {
          officerId: session.officerId,
          userId: session.userId,
          name: officer.name,
          role: session.role,
          latitude,
          longitude,
          accuracy: typeof accuracy === 'number' ? accuracy : null,
          trackingMode: trackingMode === 'demo' ? 'demo' : 'live',
          timestamp: timestamp || nowIso(),
          status: officer.status,
        };

        officerLocations.set(session.officerId, loc);

        // Update the canonical officer record so REST endpoints reflect it.
        officer.currentLocation = {
          latitude,
          longitude,
          timestamp: loc.timestamp,
        };
        officer.updatedAt = nowIso();

        await persist(['officers']);

        const adminSids = toAdminSockets(io, socketSessions);
        io.to('admins').emit('officer:location:updated', {
          officerId: loc.officerId,
          userId: loc.userId,
          name: loc.name,
          location: { latitude, longitude },
          accuracy: loc.accuracy,
          trackingMode: loc.trackingMode,
          timestamp: loc.timestamp,
          status: loc.status,
        });
        // Echo back to the sender for confirmation.
        socket.emit('officer:location:updated', { ...loc, acknowledged: true });

        if (callback) callback({ ok: true });
      };
      handler().catch(err => {
        if (callback) callback({ ok: false, error: err.message });
        else socket.emit('error', { message: err.message });
      });
    });

    // ---------------------------------------------------------------------
    // officer:status:update
    // ---------------------------------------------------------------------
    socket.on('officer:status:update', (payload, callback) => {
      const handler = async () => {
        if (session.role !== 'officer') {
          throw new Error('Only officers can update status');
        }
        if (!session.officerId) {
          throw new Error('No officer record linked to this account');
        }
        const { status } = payload || {};
        const validStatuses = ['active', 'on-leave', 'inactive', 'suspended', 'training'];
        if (!status || !validStatuses.includes(status)) {
          throw new Error('Invalid status');
        }

        const officer = findOfficer(officers, session.officerId);
        if (!officer) {
          throw new Error('Officer not found');
        }
        const oldStatus = officer.status;
        officer.status = status;
        officer.updatedAt = nowIso();

        // Keep location status in sync.
        const loc = officerLocations.get(session.officerId);
        if (loc) loc.status = status;

        await persist(['officers']);

        io.to('admins').emit('officer:status:updated', {
          officerId: session.officerId,
          userId: session.userId,
          name: officer.name,
          status,
          oldStatus,
          timestamp: nowIso(),
        });

        // Record audit
        auditLogs.unshift({
          id: 'audit' + Date.now(),
          userId: session.userId,
          user: { id: session.userId, name: session.name, role: session.role },
          action: 'OFFICER_STATUS_CHANGED',
          entityType: 'OFFICER',
          entityId: session.officerId,
          oldValues: { status: oldStatus },
          newValues: { status },
          createdAt: nowIso(),
        });

        if (callback) callback({ ok: true, status });
      };
      handler().catch(err => {
        if (callback) callback({ ok: false, error: err.message });
        else socket.emit('error', { message: err.message });
      });
    });

    // ---------------------------------------------------------------------
    // sos:create
    // ---------------------------------------------------------------------
    socket.on('sos:create', (payload, callback) => {
      const handler = async () => {
        // Officers and citizens may create SOS alerts for themselves.
        if (session.role !== 'officer' && session.role !== 'citizen') {
          throw new Error('Unauthorized to create SOS alert');
        }
        const { latitude, longitude, emergency_type = 'Other', description = '', locationAddress = '', district = '', policeStation = '', priority = 'high' } = payload || {};

        if (!isValidLatitude(latitude)) {
          throw new Error('Invalid latitude');
        }
        if (!isValidLongitude(longitude)) {
          throw new Error('Invalid longitude');
        }

        // Prevent rapid duplicate SOS submissions from the same user (30s window).
        const nowTs = Date.now();
        const recent = sosAlerts.find(
          a => String(a.userId) === String(session.userId) && nowTs - new Date(a.createdAt).getTime() < 30000
        );
        if (recent) {
          throw new Error('A recent SOS alert is already active. Please wait before submitting another.');
        }

        const sosId = 'sos' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const createdAt = nowIso();

        const user = users.find(u => String(u.id) === String(session.userId)) || null;

        const alert = {
          id: sosId,
          userId: session.userId,
          user: user
            ? { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
            : null,
          alertType: emergency_type,
          priority,
          description,
          latitude,
          longitude,
          locationAddress,
          district,
          policeStation,
          status: 'active',
          assignedOfficerId: null,
          assignedOfficer: null,
          assignedAt: null,
          acknowledgedAt: null,
          resolvedAt: null,
          responseTime: null,
          resolutionNotes: null,
          createdAt,
          updatedAt: createdAt,
        };

        sosAlerts.unshift(alert);
        await persist(['sosAlerts']);

        // Notification to admins.
        const notif = {
          id: 'notif' + Date.now(),
          userId: 'u1', // admin fallback; ideally broadcast to all admins
          type: 'sos',
          title: 'New SOS Alert',
          message: `New ${priority} ${emergency_type} alert from ${locationAddress || 'unknown location'}`,
          read: false,
          link: '/admin/sos-monitoring',
          priority: priority === 'critical' ? 'critical' : 'high',
          createdAt,
        };
        notifications.unshift(notif);
        await persist(['notifications']);

        auditLogs.unshift({
          id: 'log' + Date.now(),
          userId: session.userId,
          user: { id: session.userId, name: session.name, role: session.role },
          action: 'SOS_CREATED',
          entityType: 'SOS_ALERT',
          entityId: sosId,
          oldValues: null,
          newValues: { alertType: emergency_type, priority, status: 'active' },
          createdAt,
        });
        await persist(['auditLogs']);

        const adminSids = toAdminSockets(io, socketSessions);
        io.to('admins').emit('sos:new', alert);
        io.to('admins').emit('notification:new', notif);

        // Notify the sender.
        socket.emit('sos:created', { ok: true, alert });

        if (callback) callback({ ok: true, alert });
      };
      handler().catch(err => {
        if (callback) callback({ ok: false, error: err.message });
        else socket.emit('error', { message: err.message });
      });
    });

    // ---------------------------------------------------------------------
    // sos:acknowledge   (admin only)  active -> acknowledged
    // ---------------------------------------------------------------------
    socket.on('sos:acknowledge', (payload, callback) => {
      const handler = async () => {
        if (session.role !== 'admin' && session.role !== 'super_admin') {
          throw new Error('Only administrators can acknowledge SOS alerts');
        }
        const { sosId, notes } = payload || {};
        const alert = sosAlerts.find(a => String(a.id) === String(sosId));
        if (!alert) throw new Error('SOS alert not found');
        if (alert.status === 'resolved') throw new Error('Cannot acknowledge a resolved alert');

        const oldStatus = alert.status;
        alert.status = 'acknowledged';
        alert.acknowledgedAt = nowIso();
        alert.updatedAt = nowIso();
        if (notes) alert.resolutionNotes = notes;

        await persist(['sosAlerts']);

        const notif = {
          id: 'notif' + Date.now(),
          userId: session.userId,
          type: 'sos',
          title: 'SOS Acknowledged',
          message: `SOS alert ${sosId} acknowledged`,
          read: false,
          link: '/admin/sos-monitoring',
          priority: 'normal',
          createdAt: nowIso(),
        };
        notifications.unshift(notif);
        await persist(['notifications']);

        io.to('admins').emit('sos:updated', { ...alert, oldStatus });
        socket.emit('sos:updated', { ...alert, oldStatus });
        io.to('admins').emit('notification:new', notif);

        if (callback) callback({ ok: true, alert });
      };
      handler().catch(err => {
        if (callback) callback({ ok: false, error: err.message });
        else socket.emit('error', { message: err.message });
      });
    });

    // ---------------------------------------------------------------------
    // sos:assign   (admin only)
    // ---------------------------------------------------------------------
    socket.on('sos:assign', (payload, callback) => {
      const handler = async () => {
        if (session.role !== 'admin' && session.role !== 'super_admin') {
          throw new Error('Only administrators can assign officers');
        }
        const { sosId, officerId } = payload || {};
        const alert = sosAlerts.find(a => String(a.id) === String(sosId));
        if (!alert) throw new Error('SOS alert not found');
        const officer = findOfficer(officers, officerId);
        if (!officer) throw new Error('Officer not found');
        if (officer.status !== 'active' && officer.status !== 'on-leave') {
          // Allow assigning active officers primarily; warn otherwise but still allow.
        }

        const oldStatus = alert.status;
        const oldOfficerId = alert.assignedOfficerId;
        alert.assignedOfficerId = officerId;
        alert.assignedOfficer = {
          id: officer.id,
          name: officer.name,
          badgeNumber: officer.badgeNumber,
          district: officer.district,
        };
        alert.assignedAt = nowIso();
        alert.status = 'assigned';
        alert.updatedAt = nowIso();

        await persist(['sosAlerts']);

        const notif = {
          id: 'notif' + Date.now(),
          userId: session.userId,
          type: 'assignment',
          title: 'SOS Alert Assigned',
          message: `SOS alert ${sosId} assigned to ${officer.name}`,
          read: false,
          link: '/admin/sos-monitoring',
          priority: 'high',
          createdAt: nowIso(),
        };
        notifications.unshift(notif);
        await persist(['notifications']);

        io.to('admins').emit('sos:assigned', { ...alert, oldStatus, oldOfficerId });
        io.to('admins').emit('sos:updated', { ...alert, oldStatus });
        io.to('admins').emit('notification:new', notif);

        // Notify the assigned officer if connected.
        for (const [sid, sess] of socketSessions) {
          if (sess.officerId === officerId) {
            io.to(sid).emit('sos:assigned', { ...alert, oldStatus, oldOfficerId });
            io.to(sid).emit('notification:new', notif);
            break;
          }
        }

        if (callback) callback({ ok: true, alert });
      };
      handler().catch(err => {
        if (callback) callback({ ok: false, error: err.message });
        else socket.emit('error', { message: err.message });
      });
    });

    // ---------------------------------------------------------------------
    // sos:resolve   (admin only)  -> resolved (never deleted)
    // ---------------------------------------------------------------------
    socket.on('sos:resolve', (payload, callback) => {
      const handler = async () => {
        if (session.role !== 'admin' && session.role !== 'super_admin') {
          throw new Error('Only administrators can resolve SOS alerts');
        }
        const { sosId, resolutionNotes = '' } = payload || {};
        const alert = sosAlerts.find(a => String(a.id) === String(sosId));
        if (!alert) throw new Error('SOS alert not found');
        if (alert.status === 'resolved') throw new Error('Alert already resolved');

        const oldStatus = alert.status;
        const assignedTime = alert.assignedAt ? new Date(alert.assignedAt).getTime() : new Date(alert.createdAt).getTime();
        const responseTime = Math.round((Date.now() - assignedTime) / 1000);

        alert.status = 'resolved';
        alert.resolutionNotes = resolutionNotes;
        alert.resolvedAt = nowIso();
        alert.responseTime = responseTime;
        alert.updatedAt = nowIso();

        await persist(['sosAlerts']);

        const notif = {
          id: 'notif' + Date.now(),
          userId: session.userId,
          type: 'sos',
          title: 'SOS Alert Resolved',
          message: `SOS alert ${sosId} has been resolved`,
          read: false,
          link: '/admin/sos-monitoring',
          priority: 'normal',
          createdAt: nowIso(),
        };
        notifications.unshift(notif);
        await persist(['notifications']);

        io.to('admins').emit('sos:resolved', { ...alert, oldStatus, responseTime });
        io.to('admins').emit('sos:updated', { ...alert, oldStatus });
        io.to('admins').emit('notification:new', notif);

        if (callback) callback({ ok: true, alert });
      };
      handler().catch(err => {
        if (callback) callback({ ok: false, error: err.message });
        else socket.emit('error', { message: err.message });
      });
    });

    // ---------------------------------------------------------------------
    // Disconnect
    // ---------------------------------------------------------------------
    socket.on('disconnect', () => {
      const session = socketSessions.get(socket.id);
      if (!session) return;
      console.log(`[socket] disconnected ${session.role}:${session.id} (${socket.id})`);

      // If an officer disconnects, mark their location stale/offline and notify admins.
      if (session.role === 'officer' && session.officerId) {
        const loc = officerLocations.get(session.officerId);
        if (loc) {
          loc.status = 'offline';
          loc.timestamp = nowIso();
          io.to('admins').emit('officer:status:updated', {
            officerId: session.officerId,
            userId: session.userId,
            name: loc.name,
            status: 'offline',
            oldStatus: loc.status,
            timestamp: nowIso(),
          });
          io.to('admins').emit('officer:location:updated', {
            officerId: loc.officerId,
            userId: loc.userId,
            name: loc.name,
            location: { latitude: loc.latitude, longitude: loc.longitude },
            accuracy: loc.accuracy,
            trackingMode: loc.trackingMode,
            timestamp: loc.timestamp,
            status: 'offline',
          });
        }
      }

      socketSessions.delete(socket.id);
    });
  });

  return io;
}

module.exports = { initSocketIO };
