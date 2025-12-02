class MeetingTimer {
    constructor() {
        this.timeLeft = 0;
        this.totalTime = 0;
        this.isRunning = false;
        this.interval = null;
        this.selectedMinutes = 0;

        // 确保DOM完全加载后再初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.init();
            });
        } else {
            this.init();
        }
    }

    init() {
        this.initElements();
        this.bindEvents();
        this.loadTimerState();

        // 请求与后台同步状态
        this.requestStateSync();

        // 延迟一点再请求状态，确保popup完全加载
        setTimeout(() => {
            this.requestStateSync();
        }, 100);
    }

    initElements() {
        this.timeDisplay = document.getElementById('timeDisplay');
        this.statusDisplay = document.getElementById('statusDisplay');
        this.timerButtons = document.querySelectorAll('.timer-btn');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.presetBtns = document.querySelectorAll('.preset-btn');
        this.timerDisplay = document.querySelector('.timer-display');
        this.customTimeInput = document.getElementById('customTimeInput');
        this.setCustomTimeBtn = document.getElementById('setCustomTimeBtn');
    }

    bindEvents() {
        this.timerButtons.forEach(btn => {
            btn.addEventListener('click', () => this.selectTimer(btn));
        });

        this.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => this.startPresetTimer(btn));
        });

        this.startBtn.addEventListener('click', () => this.startTimer());
        this.pauseBtn.addEventListener('click', () => this.pauseTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());

        // 添加自定义时间输入事件
        if (this.setCustomTimeBtn) {
            this.setCustomTimeBtn.addEventListener('click', () => {
                if (this.setCustomTime) this.setCustomTime();
            });
        }

        if (this.customTimeInput) {
            this.customTimeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.setCustomTime) {
                    this.setCustomTime();
                }
            });

            // 添加输入验证
            this.customTimeInput.addEventListener('input', () => {
                if (this.clearInputValidation) {
                    this.clearInputValidation();
                }
            });
        }

        // 添加后台消息监听器
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'timerTick':
                    if (this.isRunning) {
                        this.timeLeft = request.timeLeft;
                        this.updateDisplay();
                        this.updateWarningState();
                    }
                    break;
                case 'timerWarning':
                    console.log('Popup处理timerWarning，剩余10秒');
                    // 播放警告音效
                    this.playWarningSound();
                    break;
                case 'timerPaused':
                    this.updateStatus('已暂停');
                    break;
                case 'timerReset':
                    this.updateStatus('准备就绪');
                    this.timerDisplay.classList.remove('warning', 'finished');
                    break;
                case 'timerFinished':
                    this.updateStatus('时间到！');
                    this.timerDisplay.classList.remove('running');
                    this.timerDisplay.classList.add('finished');
                    // 播放提示音和语音播报
                    this.playSound();
                    break;
                case 'timerStateSync':
                    // 当popup重新打开时同步状态
                    if (request.state) {
                        const state = request.state;
                        this.timeLeft = state.timeLeft;
                        this.totalTime = state.totalTime;
                        this.isRunning = state.isRunning;
                        this.selectedMinutes = state.selectedMinutes;

                        if (this.isRunning) {
                            this.timerDisplay.classList.add('running');
                        }

                        this.updateDisplay();
                        this.updateStatus('同步完成');
                    }
                    break;
            }
        });
    }

    selectTimer(btn) {
        if (this.isRunning) return;

        this.timerButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.selectedMinutes = parseInt(btn.dataset.minutes);
        this.timeLeft = this.selectedMinutes * 60;
        this.totalTime = this.timeLeft;
        this.updateDisplay();
        this.updateStatus('已选择 ' + this.selectedMinutes + ' 分钟');
        this.saveTimerState();

        // 通知content script显示悬浮窗
        chrome.runtime.sendMessage({
            action: 'showTimerOverlay',
            timeLeft: this.timeLeft
        });
    }

    startPresetTimer(btn) {
        if (this.isRunning) return;

        const seconds = parseInt(btn.dataset.seconds);
        this.timeLeft = seconds;
        this.totalTime = seconds;

        // 计算selectedMinutes，如果是秒则设为0
        this.selectedMinutes = seconds >= 60 ? (seconds / 60) : 0;

        this.timerButtons.forEach(b => b.classList.remove('active'));
        // 只有1、2、3分钟才激活预设按钮
        if (this.selectedMinutes === 1) this.timerButtons[0].classList.add('active');
        else if (this.selectedMinutes === 2) this.timerButtons[1].classList.add('active');
        else if (this.selectedMinutes === 3) this.timerButtons[2].classList.add('active');

        this.updateDisplay();

        // 格式化显示文本
        let timeText;
        if (seconds < 60) {
            timeText = seconds + '秒';
        } else {
            const minutes = Math.floor(seconds / 60);
            timeText = minutes + '分钟';
        }
        this.updateStatus('已设置 ' + timeText);

        this.saveTimerState();

        // 通知content script显示悬浮窗
        chrome.runtime.sendMessage({
            action: 'showTimerOverlay',
            timeLeft: this.timeLeft
        });
    }

    startTimer() {
        if (this.timeLeft <= 0) {
            this.updateStatus('请先选择倒计时时间');
            return;
        }

        // 尝试播放音频来激活音频权限（用户交互后可以播放音频）
        try {
            const audio = new Audio(chrome.runtime.getURL('sounds/done.mp3'));
            audio.volume = 0.3; // 较低音量，避免吓一跳
            audio.play().then(() => {
                // 立即暂停，只为了激活权限
                audio.pause();
                audio.currentTime = 0;
                console.log('Popup: 音频权限已激活');
            }).catch(error => {
                console.log('Popup: 音频激活（用户可能未允许自动播放）');
                // 不影响倒计时继续进行
            });
        } catch (e) {
            console.log('Popup: 音频激活异常:', e);
        }

        // 通知background.js启动倒计时
        chrome.runtime.sendMessage({
            action: 'startTimer',
            data: {
                timeLeft: this.timeLeft,
                totalTime: this.totalTime,
                selectedMinutes: this.selectedMinutes
            }
        });

        this.isRunning = true;
        this.timerDisplay.classList.add('running');
        this.updateStatus('倒计时进行中...');
        this.saveTimerState();
    }

    pauseTimer() {
        if (!this.isRunning) return;

        // 通知background.js暂停倒计时
        chrome.runtime.sendMessage({
            action: 'pauseTimer'
        });

        this.isRunning = false;
        this.timerDisplay.classList.remove('running');
        this.updateStatus('已暂停');
        this.saveTimerState();
    }

    resetTimer() {
        // 通知background.js重置倒计时
        chrome.runtime.sendMessage({
            action: 'resetTimer'
        });

        this.isRunning = false;
        this.timerDisplay.classList.remove('running', 'warning', 'finished');

        // 使用 totalTime 来重置，这样无论是分钟还是秒都能正确重置
        if (this.totalTime > 0) {
            this.timeLeft = this.totalTime;
            this.updateStatus('已重置');
        } else {
            this.timeLeft = 0;
            this.updateStatus('准备就绪');
        }

        this.updateDisplay();
        this.saveTimerState();
    }

    // 移除finishTimer方法，改为由background.js处理倒计时完成

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        this.timeDisplay.textContent = timeString;
    }

    updateWarningState() {
        // 添加警告样式
        this.timerDisplay.classList.remove('warning', 'critical');
        if (this.timeLeft <= 10 && this.timeLeft > 0) {
            this.timerDisplay.classList.add('critical');
        } else if (this.timeLeft <= 30 && this.timeLeft > 0) {
            this.timerDisplay.classList.add('warning');
        }
    }

    updateStatus(status) {
        this.statusDisplay.textContent = status;
    }

    sendNotification() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '计时器',
            message: '时间已到！'
        });
    }

    playSound() {
        // 使用Audio API播放done.mp3音频文件
        try {
            const audio = new Audio(chrome.runtime.getURL('sounds/done.mp3'));
            audio.volume = 1.0; // 最大音量

            audio.play().then(() => {
                console.log('Popup: 音频播放成功');
            }).catch(error => {
                console.log('Popup: 音频播放失败:', error);
            });

            // 音频播放结束后，播放语音播报
            audio.onended = () => {
                console.log('Popup: 音频播放完毕，播放语音播报');
                this.playSpeech();
            };
        } catch (e) {
            console.log('Popup: 音频播放异常:', e);
        }
    }

    // 播放警告音效（剩余10秒时）
    playWarningSound() {
        try {
            const audio = new Audio(chrome.runtime.getURL('sounds/done.mp3'));
            audio.volume = 1.0; // 最大音量

            audio.play().then(() => {
                console.log('Popup: 警告音效播放成功');
            }).catch(error => {
                console.log('Popup: 警告音效播放失败:', error);
            });
        } catch (e) {
            console.log('Popup: 警告音效播放异常:', e);
        }
    }

    // 播放语音播报
    playSpeech() {
        if ('speechSynthesis' in window) {
            try {
                const utterance = new SpeechSynthesisUtterance('倒计时结束，有请下一位');
                utterance.lang = 'zh-CN'; // 设置为中文
                utterance.volume = 1.0; // 最大音量
                utterance.rate = 0.9; // 语速
                utterance.pitch = 1.0; // 音调

                speechSynthesis.speak(utterance);
                console.log('Popup: 语音播报成功');
            } catch (e) {
                console.log('Popup: 语音播报失败:', e);
            }
        } else {
            console.log('Popup: 浏览器不支持语音合成API');
        }
    }

    // 解析时间输入
    parseTimeInput(input) {
        const trimmed = input.trim().toLowerCase();

        if (!trimmed || isNaN(trimmed[0])) {
            return { valid: false, error: '请输入有效的时间' };
        }

        // 解析带单位的输入
        const match = trimmed.match(/^(\d+)([sm]?)$/);
        if (!match) {
            return { valid: false, error: '格式错误，支持: 30s, 1m, 90' };
        }

        const value = parseInt(match[1]);
        const unit = match[2];

        if (value <= 0) {
            return { valid: false, error: '时间必须大于0' };
        }

        // 转换为秒
        let seconds;
        if (unit === 'm') {
            seconds = value * 60; // 分钟
        } else if (unit === 's') {
            seconds = value; // 秒
        } else {
            // 默认为秒
            seconds = value;
        }

        // 限制最大时间（24小时）
        if (seconds > 86400) {
            return { valid: false, error: '时间不能超过24小时' };
        }

        return { valid: true, seconds: seconds };
    }

    // 设置自定义时间
    setCustomTime() {
        const input = this.customTimeInput.value.trim();

        if (!input) {
            this.showInputError('请输入时间');
            return;
        }

        const result = this.parseTimeInput(input);

        if (!result.valid) {
            this.showInputError(result.error);
            return;
        }

        const seconds = result.seconds;

        // 清除之前的输入状态
        this.clearInputValidation();

        // 重置当前倒计时
        this.resetTimer();

        // 设置新的时间
        this.timeLeft = seconds;
        this.totalTime = seconds;
        this.selectedMinutes = 0; // 标记为自定义时间

        // 清除预设按钮的激活状态
        this.timerButtons.forEach(b => b.classList.remove('active'));

        // 更新显示
        this.updateDisplay();
        this.updateStatus('已设置自定义时间: ' + this.formatDuration(seconds));

        // 保存状态
        this.saveTimerState();

        // 通知content script显示悬浮窗
        if (this.timeLeft > 0) {
            chrome.runtime.sendMessage({
                action: 'showTimerOverlay',
                timeLeft: this.timeLeft
            });

            // 同时通过storage设置初始时间
            chrome.storage.local.set({
                lastUpdateTime: Date.now(),
                lastUpdateTimeValue: this.timeLeft
            });
        }

        // 显示成功状态
        this.showInputSuccess();

        // 清空输入框
        this.customTimeInput.value = '';
    }

    // 格式化时间显示
    formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds}秒`;
        } else if (seconds % 60 === 0) {
            return `${Math.floor(seconds / 60)}分钟`;
        } else {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}分${remainingSeconds}秒`;
        }
    }

    // 显示输入错误
    showInputError(message) {
        if (this.customTimeInput) {
            this.customTimeInput.classList.add('error');
            this.customTimeInput.classList.remove('success');
        }
        this.updateStatus(message);

        // 3秒后自动清除错误状态
        setTimeout(() => {
            this.clearInputValidation();
        }, 3000);
    }

    // 显示输入成功
    showInputSuccess() {
        if (this.customTimeInput) {
            this.customTimeInput.classList.add('success');
            this.customTimeInput.classList.remove('error');
        }

        // 2秒后清除成功状态
        setTimeout(() => {
            this.clearInputValidation();
        }, 2000);
    }

    // 清除输入验证状态
    clearInputValidation() {
        if (this.customTimeInput) {
            this.customTimeInput.classList.remove('error', 'success');
        }
    }

    saveTimerState() {
        const state = {
            timeLeft: this.timeLeft,
            totalTime: this.totalTime,
            isRunning: this.isRunning,
            selectedMinutes: this.selectedMinutes
        };
        chrome.storage.local.set({ timerState: state });
    }

    loadTimerState() {
        chrome.storage.local.get(['timerState'], (result) => {
            if (result.timerState) {
                const state = result.timerState;
                this.timeLeft = state.timeLeft;
                this.totalTime = state.totalTime;
                this.isRunning = state.isRunning;
                this.selectedMinutes = state.selectedMinutes;

                if (this.selectedMinutes > 0 || this.timeLeft > 0) {
                    this.updateDisplay();

                    // 如果倒计时已结束，显示finished状态
                    if (this.timeLeft === 0 && !this.isRunning) {
                        this.timerDisplay.classList.remove('running');
                        this.timerDisplay.classList.add('finished');
                        this.updateStatus('时间到！');
                    }

                    // 移除startTimer调用，因为倒计时由background.js管理
                    // 如果正在运行，UI会通过消息更新
                }
            }
        });
    }

    // 请求后台同步状态
    requestStateSync() {
        chrome.runtime.sendMessage({
            action: 'requestStateSync'
        });
    }
}

// 初始化倒计时器
document.addEventListener('DOMContentLoaded', () => {
    new MeetingTimer();
});