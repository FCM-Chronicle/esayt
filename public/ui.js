// UI 관리 스크립트
let selectedCharacter = null;

function setupUI() {
    setupCharacterSelection();
    setupButtons();
}

function setupCharacterSelection() {
    document.querySelectorAll('.character-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const charType = btn.dataset.char;
            selectCharacter(charType);
            
            // 선택 상태 업데이트
            document.querySelectorAll('.character-btn').forEach(b => {
                b.classList.remove('selected');
            });
            btn.classList.add('selected');
        });
    });
}

function selectCharacter(charType) {
    selectedCharacter = charType;
    const char = characterData[charType];
    
    // 매치 찾기 버튼 활성화
    document.getElementById('findMatchBtn').disabled = false;
    
    // 캐릭터 정보 표시
    showCharacterInfo(char);
    
    addLog(`${char.name}을(를) 선택했습니다.`);
}

function showCharacterInfo(char) {
    const infoDiv = document.getElementById('characterInfo');
    const nameDiv = document.getElementById('charName');
    const statsDiv = document.getElementById('charStats');
    const skillsDiv = document.getElementById('charSkills');
    
    nameDiv.textContent = char.name;
    
    // 스탯 표시
    statsDiv.innerHTML = `
        <div class="stat-item">체력: ${char.hp}</div>
        <div class="stat-item">공격력: ${char.atk}</div>
        <div class="stat-item">방어력: ${char.def}</div>
        <div class="stat-item">속도: ${char.speed}</div>
        <div class="description">${char.description}</div>
    `;
    
    // 스킬 표시
    skillsDiv.innerHTML = '';
    Object.entries(char.skills).forEach(([key, skill]) => {
        const skillDiv = document.createElement('div');
        skillDiv.className = 'skill-item';
        skillDiv.innerHTML = `
            <strong>${skill.name}</strong><br>
            <small>데미지: ${skill.damage} | 쿨타임: ${skill.cooldown/1000}초</small>
        `;
        skillsDiv.appendChild(skillDiv);
    });
    
    infoDiv.style.display = 'block';
}

function setupButtons() {
    // 매치 찾기 버튼
    document.getElementById('findMatchBtn').addEventListener('click', () => {
        if (!selectedCharacter) {
            alert('캐릭터를 선택해주세요!');
            return;
        }
        
        if (networkManager && networkManager.connected) {
            networkManager.findMatch(selectedCharacter);
        } else {
            alert('서버에 연결되지 않았습니다.');
        }
    });
    
    // 매치 취소 버튼
    document.getElementById('cancelMatchBtn').addEventListener('click', () => {
        // 소켓 연결 해제 후 재연결로 매치 취소
        if (networkManager && networkManager.socket) {
            networkManager.socket.disconnect();
            setTimeout(() => {
                networkManager.connect();
                showScreen('characterSelect');
            }, 100);
        }
    });
}

function showScreen(screenId) {
    console.log('화면 전환:', screenId);
    
    // 모든 화면 숨기기
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // 선택된 화면 표시
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'block';
        console.log('화면 전환 완료:', screenId);
    } else {
        console.error('화면을 찾을 수 없습니다:', screenId);
    }
}

// 전역으로 내보내기
window.showScreen = showScreen;

// 연결 상태 업데이트
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.textContent = connected ? '온라인' : '오프라인';
        statusElement.className = connected ? 'connected' : 'disconnected';
    }
}

// 키보드 단축키
document.addEventListener('keydown', (e) => {
    // ESC로 화면 전환
    if (e.code === 'Escape') {
        if (window.networkManager && window.networkManager.gameState === 'waiting') {
            document.getElementById('cancelMatchBtn').click();
        }
    }
    
    // 캐릭터 선택 단축키 (1-4)
    if (window.networkManager && window.networkManager.gameState === 'menu') {
        const charMap = {
            'Digit1': 'tanjiro',
            'Digit2': 'zenitsu', 
            'Digit3': 'akaza',
            'Digit4': 'doma'
        };
        
        if (charMap[e.code]) {
            const charBtn = document.querySelector(`[data-char="${charMap[e.code]}"]`);
            if (charBtn) charBtn.click();
        }
        
        // Enter로 매치 찾기
        if (e.code === 'Enter' && selectedCharacter) {
            document.getElementById('findMatchBtn').click();
        }
    }
});
