// ===============================================
// MONSTER KOZMIC CASINO - MULTIPLAYER SERVER
// Complete Socket.io Server from Grok's Response
// ===============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// ===============================================
// GAME CONSTANTS
// ===============================================

const COSMIC_SYMBOLS = ['🎸', '🎹', '🥔', '🌟', '🤖', '🦙', '🕳️', '🧠'];
const MAX_PLAYERS = 8;
const SPIN_COST = 50;

// ===============================================
// ROOM STATE STORAGE
// ===============================================
// In-memory storage (use Redis for production scaling)
const rooms = {}; 
// Structure: { roomCode: { players: [], gameState: {} } }

// ===============================================
// HELPER FUNCTIONS
// ===============================================

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function evaluateResults(results) {
  const [r1, r2, r3] = results;
  
  // Triple match
  if (r1 === r2 && r2 === r3) {
    let reward = 1000;
    let message = '';
    
    switch (r1) {
      case '🥔':
        reward = 2000;
        message = '🥔 TRIPLE POTATO ENLIGHTENMENT! +2000 CTOK!';
        break;
      case '🤖':
        reward = 3000;
        message = '🤖 MACHINE CONSCIOUSNESS ACHIEVED! +3000 CTOK!';
        break;
      case '🧠':
        reward = 5000;
        message = '🧠 ULTIMATE BRAIN JACKPOT! +5000 CTOK!';
        break;
      default:
        message = `✨ TRIPLE ${r1}! Cosmic alignment! +${reward} CTOK!`;
    }
    
    return { reward, message };
  }
  
  // Special symbols
  if (results.includes('🤖')) {
    return { reward: 100, message: '🤖 MACHINE CONSCIOUSNESS BONUS! +100 CTOK!' };
  }
  
  if (results.includes('🧠')) {
    return { reward: 50, message: '🧠 BRAIN POWER BONUS! +50 CTOK + WISDOM!' };
  }
  
  // Consolation prize
  return { reward: 25, message: 'Close call! +25 CTOK consolation' };
}

function getLeaderboard(roomCode) {
  if (!rooms[roomCode]) return [];
  
  return rooms[roomCode].players
    .sort((a, b) => b.ctok - a.ctok)
    .map(p => ({
      name: p.name,
      ctok: p.ctok,
      enlightenment: p.enlightenment,
      shots: p.shots
    }));
}

function findPlayerRoom(socketId) {
  for (const roomCode in rooms) {
    const player = rooms[roomCode].players.find(p => p.id === socketId);
    if (player) return roomCode;
  }
  return null;
}

// ===============================================
// STATIC FILE SERVING
// ===============================================

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    rooms: Object.keys(rooms).length,
    totalPlayers: Object.values(rooms).reduce((sum, room) => sum + room.players.length, 0)
  });
});

// ===============================================
// SOCKET.IO CONNECTION HANDLER
// ===============================================

io.on('connection', (socket) => {
  console.log(`🌟 Player connected: ${socket.id}`);

  // =========================================
  // CREATE ROOM
  // =========================================
  socket.on('createRoom', (callback) => {
    const roomCode = generateRoomCode();
    
    rooms[roomCode] = {
      players: [],
      gameState: {
        currentEvent: null,
        shots: 0,
        createdAt: Date.now()
      }
    };
    
    console.log(`🎰 Room created: ${roomCode}`);
    callback({ success: true, roomCode });
  });

  // =========================================
  // JOIN ROOM
  // =========================================
  socket.on('joinRoom', (data, callback) => {
    const { roomCode, playerName } = data;
    
    // Validation
    if (!rooms[roomCode]) {
      return callback({ success: false, message: 'Room not found' });
    }
    
    if (rooms[roomCode].players.length >= MAX_PLAYERS) {
      return callback({ success: false, message: 'Room full' });
    }
    
    // Create player object
    const player = {
      id: socket.id,
      name: playerName || 'Anonymous Astronaut',
      ctok: 1000,
      enlightenment: 0,
      shots: 0,
      joinedAt: Date.now()
    };
    
    // Add to room
    rooms[roomCode].players.push(player);
    socket.join(roomCode);
    
    console.log(`👤 ${playerName} joined room ${roomCode}`);
    
    // Broadcast to room
    io.to(roomCode).emit('playerJoined', player);
    io.to(roomCode).emit('updateLeaderboard', getLeaderboard(roomCode));
    
    callback({ 
      success: true, 
      roomCode, 
      players: rooms[roomCode].players 
    });
  });

  // =========================================
  // REQUEST SPIN (SERVER-SIDE RNG)
  // =========================================
  socket.on('requestSpin', (roomCode, callback) => {
    if (!rooms[roomCode]) {
      return callback({ success: false, message: 'Room not found' });
    }
    
    const player = rooms[roomCode].players.find(p => p.id === socket.id);
    
    if (!player) {
      return callback({ success: false, message: 'Player not in room' });
    }
    
    if (player.ctok < SPIN_COST) {
      return callback({ success: false, message: 'Insufficient CTOK' });
    }
    
    // Deduct CTOK
    player.ctok -= SPIN_COST;
    
    // Generate results (server-side RNG for fairness)
    const results = [
      COSMIC_SYMBOLS[Math.floor(Math.random() * COSMIC_SYMBOLS.length)],
      COSMIC_SYMBOLS[Math.floor(Math.random() * COSMIC_SYMBOLS.length)],
      COSMIC_SYMBOLS[Math.floor(Math.random() * COSMIC_SYMBOLS.length)]
    ];
    
    // Evaluate results
    const { reward, message } = evaluateResults(results);
    player.ctok += reward;
    
    // Update enlightenment for special symbols
    if (results.includes('🧠')) player.enlightenment += 10;
    if (results.includes('🤖')) player.enlightenment += 5;
    
    console.log(`🎰 ${player.name} spun: ${results.join('')} - Reward: ${reward}`);
    
    // Broadcast spin start
    io.to(roomCode).emit('spinStarted', { 
      playerId: socket.id, 
      results 
    });
    
    // Broadcast results after animation time
    setTimeout(() => {
      io.to(roomCode).emit('spinResult', { 
        playerId: socket.id, 
        results, 
        reward, 
        message 
      });
      
      io.to(roomCode).emit('updateLeaderboard', getLeaderboard(roomCode));
    }, 1000);
    
    callback({ success: true, results, reward, message });
  });

  // =========================================
  // TAKE SHOT
  // =========================================
  socket.on('takeShot', (roomCode) => {
    if (!rooms[roomCode]) return;
    
    const player = rooms[roomCode].players.find(p => p.id === socket.id);
    
    if (player) {
      player.shots += 1;
      rooms[roomCode].gameState.shots += 1;
      
      console.log(`🍸 ${player.name} took a shot (total: ${player.shots})`);
      
      io.to(roomCode).emit('playerShot', socket.id);
      io.to(roomCode).emit('updateLeaderboard', getLeaderboard(roomCode));
    }
  });

  // =========================================
  // TRIGGER COSMIC EVENT
  // =========================================
  socket.on('triggerEvent', (roomCode, eventType) => {
    if (!rooms[roomCode]) return;
    
    rooms[roomCode].gameState.currentEvent = eventType;
    
    console.log(`🌌 Cosmic event triggered in ${roomCode}: ${eventType}`);
    
    io.to(roomCode).emit('cosmicEvent', eventType);
  });

  // =========================================
  // SEND EMOJI
  // =========================================
  socket.on('sendEmoji', (roomCode, emoji) => {
    if (!rooms[roomCode]) return;
    
    io.to(roomCode).emit('receiveEmoji', { 
      playerId: socket.id, 
      emoji 
    });
  });

  // =========================================
  // DISCONNECT / LEAVE
  // =========================================
  socket.on('disconnect', () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
    
    // Find and remove player from all rooms
    for (const roomCode in rooms) {
      const playerIndex = rooms[roomCode].players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = rooms[roomCode].players[playerIndex];
        console.log(`👋 ${player.name} left room ${roomCode}`);
        
        rooms[roomCode].players.splice(playerIndex, 1);
        
        // Broadcast player left
        io.to(roomCode).emit('playerLeft', socket.id);
        io.to(roomCode).emit('updateLeaderboard', getLeaderboard(roomCode));
        
        // Cleanup empty rooms
        if (rooms[roomCode].players.length === 0) {
          console.log(`🧹 Cleaning up empty room: ${roomCode}`);
          delete rooms[roomCode];
        }
      }
    }
  });
});

// ===============================================
// PERIODIC CLEANUP
// ===============================================
// Clean up rooms older than 2 hours with no players
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  
  for (const roomCode in rooms) {
    const room = rooms[roomCode];
    if (room.players.length === 0 && (now - room.gameState.createdAt) > TWO_HOURS) {
      console.log(`🧹 Cleaning up old empty room: ${roomCode}`);
      delete rooms[roomCode];
    }
  }
}, 60 * 60 * 1000); // Run every hour

// ===============================================
// START SERVER
// ===============================================

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  🎰 MONSTER KOZMIC CASINO SERVER 🎰      ║
║                                           ║
║  Status: RUNNING                          ║
║  Port: ${PORT}                               ║
║  Mode: ${process.env.NODE_ENV || 'development'}                    ║
║                                           ║
║  🌐 Ready for cosmic chaos!               ║
╚═══════════════════════════════════════════╝
  `);
});

// ===============================================
// GRACEFUL SHUTDOWN
// ===============================================

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
