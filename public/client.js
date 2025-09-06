// 클라이언트 사이드 네트워크 코드
class NetworkManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.gameState = 'menu'; // menu, waiting, playing, ended
        this.onlineGameData = {
            players: [],
            projectiles: [],
            myPlayer: null
        };
    }

    connect() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('서버에 연결되었습니다.');
            this.connected = true;
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('서버와의 연결이 끊어졌습니다.');
            this.connected = false;
            this.updateConnectionStatus(false);
            this.gameState = 'menu';
        });

        this.socket.on('waitingForMatch', () => {
            this.gameState = 'waiting';
            this.showWaitingScreen();
        });

        this.socket.on('playerJoined', (data) => {
            console.log('플레이어 참가:', data);
            this.updateLobby(data);
        });

        this.socket.on('gameStart', (data) => {
            console.log('게임 시작:', data);
            this.gameState = 'playing';
            this.startOnlineGame(data);
        });

        this.socket.on('gameState', (data) => {
            this.updateGameState(data);
        });

        this.socket.on('skillUsed', (data) => {
            this.showSkillEffect(data);
        });

        this.socket.on('playerDamaged', (data) => {
            this.showDamageEffect(data);
        });

        this.socket.on('gameEnd', (data) => {
            this.gameState = 'ended';
            this.showGameEnd(data);
        });

        this.socket.on('roomReset', () => {
            this.gameState = 'menu';
            this.resetToMenu();
        });
    }

    findMatch(characterType) {
        if (!this.connected) {
            alert('서버에 연결되지 않았습니다.');
            return;
        }

        const playerData = {
            name: characterData[characterType].name,
            charType: characterType,
            ...characterData[characterType]
        };

        this.socket.emit('findMatch', playerData);
        addLog(`매치를 찾는 중... (${playerData.name})`);
    }

    sendPlayerAction(type, data) {
        if (this.socket && this.gameState === 'playing') {
            this.socket.emit('playerAction', { type, data });
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = connected ? '온라인' : '오프라인';
            statusElement.className = connected ? 'connected' : 'disconnected';
        }
    }

    showWaitingScreen() {
        // UI 업데이트
        document.getElementById('characterSelect').style.display = 'none';
        document.getElementById('waitingScreen').style.display = 'block';
        
        addLog('상대방을 기다리는 중...');
    }

    updateLobby(data) {
        addLog(`플레이어 ${data.playerId} 참가 (${data.playerCount}/2)`);
    }

    startOnlineGame(data) {
        // 온라인 게임 시작
        this.onlineGameData.players = data.players;
        this.playerId = data.players.find(p => p.id)?.id;
        
        // UI 전환
        document.getElementById('waitingScreen').style.display = 'none';
        document.getElementById('gameArea').style.display = 'block';
        
        // 게임 루프 시작
        if (this.gameLoop) clearInterval(this.gameLoop);
        this.gameLoop = setInterval(() => {
            this.renderOnlineGame();
        }, 16);
        
        addLog('온라인 게임이 시작되었습니다!');
    }

    updateGameState(data) {
        this.onlineGameData.players = data.players;
        this.onlineGameData.projectiles = data.projectiles;
        this.onlineGameData.myPlayer = data.players.find(p => p.id === this.playerId);
        
        // UI 업데이트
        this.updateOnlineUI();
    }

    renderOnlineGame() {
        if (this.gameState !== 'playing') return;

        // 화면 클리어
        ctx.fillStyle = 'rgba(20, 30, 60, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 배경 그리드
        this.drawGrid();
        
        // 장애물
        this.drawObstacles();

        // 플레이어들 그리기
        this.onlineGameData.players.forEach(player => {
            this.drawOnlinePlayer(player);
        });

        // 투사체 그리기
        this.onlineGameData.projectiles.forEach(projectile => {
            this.drawProjectile(projectile);
        });
    }

    drawOnlinePlayer(player) {
        const isMyPlayer = player.id === this.playerId;
        
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);
        
        // 무적 상태 표시
        if (player.statusEffects.includes('invulnerable')) {
            ctx.globalAlpha = 0.5;
        }
        
        // 둔화 상태 표시
        if (player.statusEffects.includes('slow')) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 3;
            ctx.strokeRect(-22, -22, 44, 44);
        }
        
        // 플레이어 색상 (내 플레이어는 다른 색)
        ctx.fillStyle = isMyPlayer ? '#2ecc71' : this.getPlayerColor(player.charType);
        ctx.fillRect(-20, -20, 40, 40);
        
        // 방향 표시
        ctx.fillStyle = '#fff';
        ctx.fillRect(15, -2, 10, 4);
        
        ctx.restore();

        //
