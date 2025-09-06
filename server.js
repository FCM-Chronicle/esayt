const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.static('public'));

// 게임 룸 관리
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.gameState = 'waiting'; // waiting, playing, ended
    this.gameData = {
      projectiles: [],
      effects: [],
      areas: []
    };
    this.lastUpdate = Date.now();
  }

  addPlayer(socket, playerData) {
    if (this.players.size >= 2) return false;
    
    const playerId = this.players.size + 1;
    this.players.set(socket.id, {
      id: playerId,
      socket: socket,
      ...playerData,
      x: playerId === 1 ? 150 : 850,
      y: 300,
      angle: 0,
      targetAngle: 0,
      hp: playerData.maxHp,
      cooldowns: {
        basic: 0,
        skill1: 0,
        skill2: 0,
        ultimate: 0
      },
      statusEffects: {},
      lastAction: Date.now()
    });

    socket.join(this.id);
    this.broadcastToRoom('playerJoined', {
      playerId: playerId,
      playerCount: this.players.size,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        charType: p.charType,
        color: p.color
      }))
    });

    if (this.players.size === 2) {
      this.startGame();
    }

    return true;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.broadcastToRoom('playerLeft', {
        playerId: player.id,
        playerCount: this.players.size
      });

      if (this.players.size === 0) {
        return true; // 룸 삭제 신호
      } else if (this.gameState === 'playing') {
        // 게임 중 플레이어가 나가면 게임 종료
        this.endGame('disconnect');
      }
    }
    return false;
  }

  startGame() {
    this.gameState = 'playing';
    this.broadcastToRoom('gameStart', {
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        charType: p.charType,
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp
      }))
    });
    
    // 게임 루프 시작
    this.gameLoop = setInterval(() => {
      this.updateGame();
    }, 16); // 60fps
  }

  updateGame() {
    if (this.gameState !== 'playing') return;

    const now = Date.now();
    const deltaTime = now - this.lastUpdate;
    this.lastUpdate = now;

    // 플레이어 업데이트
    for (let [socketId, player] of this.players) {
      this.updatePlayer(player, deltaTime);
    }

    // 충돌 검사
    this.checkCollisions();

    // 게임 종료 조건 체크
    this.checkGameEnd();

    // 클라이언트에 게임 상태 전송
    this.broadcastGameState();
  }

  updatePlayer(player, deltaTime) {
    // 쿨다운 감소
    for (let skill in player.cooldowns) {
      if (player.cooldowns[skill] > 0) {
        player.cooldowns[skill] = Math.max(0, player.cooldowns[skill] - deltaTime);
      }
    }

    // 상태 효과 업데이트
    for (let effect in player.statusEffects) {
      player.statusEffects[effect] = Math.max(0, player.statusEffects[effect] - deltaTime);
      if (player.statusEffects[effect] <= 0) {
        delete player.statusEffects[effect];
      }
    }
  }

  handlePlayerAction(socketId, action) {
    const player = this.players.get(socketId);
    if (!player || this.gameState !== 'playing') return;

    switch (action.type) {
      case 'move':
        this.handlePlayerMove(player, action.data);
        break;
      case 'skill':
        this.handlePlayerSkill(player, action.data);
        break;
    }
  }

  handlePlayerMove(player, moveData) {
    // 이동 처리 (느린 방향 전환)
    if (moveData.targetAngle !== undefined) {
      player.targetAngle = moveData.targetAngle;
    }

    // 각도 보간
    let angleDiff = player.targetAngle - player.angle;
    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    player.angle += angleDiff * 0.1;

    // 이동
    if (moveData.moving) {
      let speed = player.speed;
      if (player.statusEffects.slow) {
        speed *= 0.5;
      }

      const moveX = Math.cos(player.angle) * speed;
      const moveY = Math.sin(player.angle) * speed;

      // 경계 체크
      const newX = player.x + moveX;
      const newY = player.y + moveY;

      if (newX > 20 && newX < 980) player.x = newX;
      if (newY > 20 && newY < 580) player.y = newY;
    }
  }

  handlePlayerSkill(player, skillData) {
    const { skillType } = skillData;
    
    if (player.cooldowns[skillType] > 0) return;

    // 스킬 실행
    const skill = this.getSkillData(player.charType, skillType);
    if (!skill) return;

    player.cooldowns[skillType] = skill.cooldown;

    // 스킬 효과 적용
    this.executeSkill(player, skill, skillType);

    this.broadcastToRoom('skillUsed', {
      playerId: player.id,
      skillType: skillType,
      skillName: skill.name,
      x: player.x,
      y: player.y,
      angle: player.angle
    });
  }

  executeSkill(player, skill, skillType) {
    const damage = skill.damage * (player.atk / 100);
    
    switch (skill.type) {
      case 'projectile':
        this.createProjectile(player, damage, skill);
        break;
      case 'dash':
        this.executeDash(player, damage, skill);
        break;
      case 'explosion':
        this.createExplosion(player, damage, skill);
        break;
      case 'area':
        this.createArea(player, damage, skill);
        break;
    }
  }

  createProjectile(player, damage, skill) {
    const projectile = {
      id: Date.now() + Math.random(),
      ownerId: player.id,
      x: player.x + Math.cos(player.angle) * 30,
      y: player.y + Math.sin(player.angle) * 30,
      vx: Math.cos(player.angle) * 8,
      vy: Math.sin(player.angle) * 8,
      damage: damage,
      life: 60, // 1초
      size: 8
    };

    this.gameData.projectiles.push(projectile);
  }

  checkCollisions() {
    const players = Array.from(this.players.values());
    if (players.length < 2) return;

    const [p1, p2] = players;

    // 투사체 충돌
    this.gameData.projectiles = this.gameData.projectiles.filter(proj => {
      proj.x += proj.vx;
      proj.y += proj.vy;
      proj.life--;

      // 플레이어와 충돌 체크
      const target = proj.ownerId === p1.id ? p2 : p1;
      const distance = Math.hypot(proj.x - target.x, proj.y - target.y);
      
      if (distance < proj.size + 20) {
        this.damagePlayer(target, proj.damage, proj.ownerId);
        return false; // 투사체 제거
      }

      return proj.life > 0 && proj.x > 0 && proj.x < 1000 && proj.y > 0 && proj.y < 600;
    });
  }

  damagePlayer(player, damage, attackerId) {
    if (player.statusEffects.invulnerable) return;

    const finalDamage = Math.max(20, damage - player.def);
    player.hp = Math.max(0, player.hp - finalDamage);

    // 짧은 무적 시간
    player.statusEffects.invulnerable = 200;

    this.broadcastToRoom('playerDamaged', {
      playerId: player.id,
      damage: finalDamage,
      hp: player.hp,
      maxHp: player.maxHp,
      attackerId: attackerId
    });
  }

  checkGameEnd() {
    const players = Array.from(this.players.values());
    const alivePlayers = players.filter(p => p.hp > 0);

    if (alivePlayers.length <= 1 && players.length === 2) {
      this.endGame('victory', alivePlayers[0]);
    }
  }

  endGame(reason, winner = null) {
    this.gameState = 'ended';
    
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }

    this.broadcastToRoom('gameEnd', {
      reason: reason,
      winner: winner ? {
        id: winner.id,
        name: winner.name
      } : null
    });

    // 5초 후 룸 리셋
    setTimeout(() => {
      this.resetRoom();
    }, 5000);
  }

  resetRoom() {
    this.gameState = 'waiting';
    this.gameData = {
      projectiles: [],
      effects: [],
      areas: []
    };
    
    // 플레이어 상태 리셋
    for (let [socketId, player] of this.players) {
      player.hp = player.maxHp;
      player.x = player.id === 1 ? 150 : 850;
      player.y = 300;
      player.cooldowns = {
        basic: 0,
        skill1: 0,
        skill2: 0,
        ultimate: 0
      };
      player.statusEffects = {};
    }

    this.broadcastToRoom('roomReset');
  }

  broadcastGameState() {
    const gameState = {
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        cooldowns: p.cooldowns,
        statusEffects: Object.keys(p.statusEffects)
      })),
      projectiles: this.gameData.projectiles
    };

    this.broadcastToRoom('gameState', gameState);
  }

  broadcastToRoom(event, data) {
    io.to(this.id).emit(event, data);
  }

  getSkillData(charType, skillType) {
    // characterData를 서버에서도 사용하기 위해 별도 파일로 분리 필요
    const characterData = require('./shared/characterData');
    return characterData[charType]?.skills[skillType];
  }
}

// 게임 룸 관리
const rooms = new Map();
const waitingPlayers = [];

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  console.log(`플레이어 연결: ${socket.id}`);

  socket.on('findMatch', (playerData) => {
    console.log(`매치 찾기: ${playerData.name} (${playerData.charType})`);
    
    // 대기 중인 플레이어가 있는지 확인
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift();
      
      // 새 룸 생성
      const roomId = `room_${Date.now()}`;
      const room = new GameRoom(roomId);
      rooms.set(roomId, room);
      
      // 두 플레이어를 룸에 추가
      room.addPlayer(opponent.socket, opponent.playerData);
      room.addPlayer(socket, playerData);
      
      console.log(`매치 성사: 룸 ${roomId}`);
    } else {
      // 대기열에 추가
      waitingPlayers.push({ socket, playerData });
      socket.emit('waitingForMatch');
      console.log(`대기열에 추가: ${playerData.name}`);
    }
  });

  socket.on('playerAction', (action) => {
    // 플레이어가 속한 룸 찾기
    const room = Array.from(rooms.values()).find(r => r.players.has(socket.id));
    if (room) {
      room.handlePlayerAction(socket.id, action);
    }
  });

  socket.on('disconnect', () => {
    console.log(`플레이어 연결 해제: ${socket.id}`);
    
    // 대기열에서 제거
    const waitingIndex = waitingPlayers.findIndex(p => p.socket.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // 룸에서 제거
    for (let [roomId, room] of rooms) {
      if (room.removePlayer(socket.id)) {
        rooms.delete(roomId);
        console.log(`룸 삭제: ${roomId}`);
        break;
      }
    }
  });
});

// 정적 파일 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 상태 API
app.get('/api/status', (req, res) => {
  res.json({
    activeRooms: rooms.size,
    waitingPlayers: waitingPlayers.length,
    totalConnections: io.engine.clientsCount
  });
});

server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`http://localhost:${PORT}`);
});
