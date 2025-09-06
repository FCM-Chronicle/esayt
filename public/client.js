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
        console.log('게임 시작 데이터:', data);
        
        // 온라인 게임 시작
        this.onlineGameData.players = data.players;
        
        // 내 플레이어 ID 찾기 (소켓 ID로는 찾을 수 없으므로 첫 번째 플레이어를 나로 가정)
        this.playerId = data.players[0]?.id || 1;
        
        console.log('내 플레이어 ID:', this.playerId);
        console.log('플레이어들:', data.players);
        
        // UI 전환
        document.getElementById('waitingScreen').style.display = 'none';
        document.getElementById('gameArea').style.display = 'block';
        
        // 게임 루프 시작
        if (this.gameLoop) clearInterval(this.gameLoop);
        this.gameLoop = setInterval(() => {
            this.renderOnlineGame();
        }, 16);
        
        addLog('온라인 게임이 시작되었습니다!');
        addLog(`플레이어들: ${data.players.map(p => p.name).join(' vs ')}`);
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

        // 이름 표시
        ctx.fillStyle = isMyPlayer ? '#2ecc71' : '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.getPlayerName(player.charType), player.x, player.y - 30);
        
        // 체력바
        this.drawPlayerHealthBar(player);
    }

    drawPlayerHealthBar(player) {
        const barWidth = 40;
        const barHeight = 6;
        const hpPercent = player.hp / player.maxHp;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(player.x - barWidth/2, player.y - 40, barWidth, barHeight);
        ctx.fillStyle = hpPercent > 0.3 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(player.x - barWidth/2, player.y - 40, barWidth * hpPercent, barHeight);
        
        // 체력 텍스트
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${player.hp}/${player.maxHp}`, player.x, player.y - 45);
    }

    drawProjectile(projectile) {
        const color = this.getPlayerColor(this.getPlayerCharType(projectile.ownerId));
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawGrid() {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    drawObstacles() {
        ctx.save();
        ctx.fillStyle = '#8b4513';
        ctx.shadowColor = '#654321';
        ctx.shadowBlur = 5;
        
        obstacles.forEach(obstacle => {
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.strokeStyle = '#a0522d';
            ctx.lineWidth = 2;
            ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        });
        
        ctx.restore();
    }

    updateOnlineUI() {
        if (!this.onlineGameData.myPlayer) return;

        const myPlayer = this.onlineGameData.myPlayer;
        const opponent = this.onlineGameData.players.find(p => p.id !== this.playerId);

        // 체력바 업데이트
        if (myPlayer) {
            const myHealthPercent = (myPlayer.hp / myPlayer.maxHp) * 100;
            document.getElementById('myHealth').style.width = myHealthPercent + '%';
            this.updateSkillCooldowns(myPlayer, 'mySkills');
        }

        if (opponent) {
            const opponentHealthPercent = (opponent.hp / opponent.maxHp) * 100;
            document.getElementById('opponentHealth').style.width = opponentHealthPercent + '%';
        }
    }

    updateSkillCooldowns(player, elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        element.innerHTML = '';
        
        for (let skillType in player.cooldowns) {
            const cooldown = Math.max(0, player.cooldowns[skillType]);
            const skill = characterData[this.getPlayerCharType(player.id)]?.skills[skillType];
            if (!skill) continue;
            
            const div = document.createElement('div');
            div.className = 'skill-cooldown';
            
            if (cooldown > 0) {
                div.classList.add('cooling');
                div.textContent = `${skill.name}: ${(cooldown/1000).toFixed(1)}s`;
                div.style.color = '#e74c3c';
            } else {
                div.classList.add('ready');
                div.textContent = `${skill.name}: Ready`;
                div.style.color = '#2ecc71';
            }
            
            element.appendChild(div);
        }
    }

    showSkillEffect(data) {
        // 스킬 사용 이펙트 표시
        addLog(`${this.getPlayerName(this.getPlayerCharType(data.playerId))}이(가) ${data.skillName}을(를) 사용했습니다!`, 'skill');
        
        // 화면에 이펙트 표시
        this.createVisualEffect(data.x, data.y, 'skill', this.getPlayerColor(this.getPlayerCharType(data.playerId)));
    }

    showDamageEffect(data) {
        const playerName = this.getPlayerName(this.getPlayerCharType(data.playerId));
        const attackerName = this.getPlayerName(this.getPlayerCharType(data.attackerId));
        
        addLog(`${attackerName}이(가) ${playerName}에게 ${data.damage} 데미지를 입혔습니다! (${data.hp}/${data.maxHp})`, 'damage');
        
        // 플레이어 위치에 데미지 이펙트
        const player = this.onlineGameData.players.find(p => p.id === data.playerId);
        if (player) {
            this.createVisualEffect(player.x, player.y, 'damage', '#ff0000');
        }
    }

    showGameEnd(data) {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }

        // 게임 종료 화면 표시
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('게임 종료!', canvas.width/2, canvas.height/2 - 50);
        
        if (data.winner) {
            ctx.font = '24px Arial';
            const isWinner = data.winner.id === this.playerId;
            ctx.fillStyle = isWinner ? '#2ecc71' : '#e74c3c';
            ctx.fillText(isWinner ? '승리!' : '패배!', canvas.width/2, canvas.height/2);
            ctx.fillStyle = '#fff';
            ctx.fillText(`${data.winner.name} 승리`, canvas.width/2, canvas.height/2 + 30);
        }
        
        ctx.font = '16px Arial';
        ctx.fillText('잠시 후 메인 메뉴로 돌아갑니다...', canvas.width/2, canvas.height/2 + 80);
        ctx.restore();

        if (data.winner) {
            addLog(`${data.winner.name}이(가) 승리했습니다!`, 'victory');
        }
    }

    resetToMenu() {
        // 메인 메뉴로 돌아가기
        document.getElementById('gameArea').style.display = 'none';
        document.getElementById('waitingScreen').style.display = 'none';
        document.getElementById('characterSelect').style.display = 'block';
        
        // 캐릭터 선택 초기화
        document.querySelectorAll('.character-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        this.drawInitialScreen();
        addLog('메인 메뉴로 돌아왔습니다.');
    }

    createVisualEffect(x, y, type, color) {
        // 간단한 시각 이펙트 (실제로는 더 복잡한 이펙트 시스템 필요)
        const effect = {
            x: x,
            y: y,
            type: type,
            color: color,
            life: 30,
            maxLife: 30
        };
        
        // 이펙트 애니메이션 (간단한 구현)
        const animateEffect = () => {
            if (effect.life <= 0) return;
            
            ctx.save();
            ctx.globalAlpha = effect.life / effect.maxLife;
            ctx.fillStyle = effect.color;
            
            if (type === 'damage') {
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 20 * (1 - effect.life / effect.maxLife), 0, Math.PI * 2);
                ctx.fill();
            } else if (type === 'skill') {
                ctx.shadowColor = effect.color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 30 * (1 - effect.life / effect.maxLife), 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
            effect.life--;
            
            if (effect.life > 0) {
                requestAnimationFrame(animateEffect);
            }
        };
        
        animateEffect();
    }

    getPlayerColor(charType) {
        return characterData[charType]?.color || '#ffffff';
    }

    getPlayerName(charType) {
        return characterData[charType]?.name || 'Unknown';
    }

    getPlayerCharType(playerId) {
        const player = this.onlineGameData.players.find(p => p.id === playerId);
        return player?.charType || 'tanjiro';
    }

    drawInitialScreen() {
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('귀멸의 칼날: 혈귀 대결', canvas.width/2, canvas.height/2 - 50);
        
        ctx.font = '18px Arial';
        ctx.fillText('온라인 매치메이킹', canvas.width/2, canvas.height/2);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#95a5a6';
        ctx.fillText('캐릭터를 선택하고 매치를 시작하세요', canvas.width/2, canvas.height/2 + 40);
    }
}

// 온라인 입력 처리
class OnlineInputManager {
    constructor(networkManager) {
        this.network = networkManager;
        this.keys = {};
        this.lastMoveData = {};
        this.setupInputHandlers();
    }

    setupInputHandlers() {
        document.addEventListener('keydown', (e) => {
            if (this.network.gameState !== 'playing') return;
            
            this.keys[e.code] = true;
            this.handleMovement();
            this.handleSkills(e.code);
        });

        document.addEventListener('keyup', (e) => {
            if (this.network.gameState !== 'playing') return;
            
            this.keys[e.code] = false;
            this.handleMovement();
        });
    }

    handleMovement() {
        let targetAngle = null;
        let moving = false;

        // WASD 입력 처리
        if (this.keys['KeyW']) {
            targetAngle = -Math.PI / 2;
            moving = true;
        }
        if (this.keys['KeyS']) {
            targetAngle = Math.PI / 2;
            moving = true;
        }
        if (this.keys['KeyA']) {
            targetAngle = Math.PI;
            moving = true;
        }
        if (this.keys['KeyD']) {
            targetAngle = 0;
            moving = true;
        }

        const moveData = { targetAngle, moving };
        
        // 이전 데이터와 다를 때만 전송 (네트워크 최적화)
        if (JSON.stringify(moveData) !== JSON.stringify(this.lastMoveData)) {
            this.network.sendPlayerAction('move', moveData);
            this.lastMoveData = moveData;
        }
    }

    handleSkills(keyCode) {
        let skillType = null;

        switch (keyCode) {
            case 'Space':
                skillType = 'basic';
                break;
            case 'KeyN':
                skillType = 'skill1';
                break;
            case 'KeyM':
                skillType = 'skill2';
                break;
            case 'Comma':
                skillType = 'ultimate';
                break;
        }

        if (skillType) {
            this.network.sendPlayerAction('skill', { skillType });
        }
    }
}

// 전역 변수
let networkManager;
let inputManager;

// 온라인 게임 초기화
function initOnlineGame() {
    networkManager = new NetworkManager();
    inputManager = new OnlineInputManager(networkManager);
    
    networkManager.connect();
    networkManager.drawInitialScreen();
}
