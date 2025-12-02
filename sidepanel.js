class MeetingTimer {
    constructor() {
        this.timeLeft = 0;
        this.totalTime = 0;
        this.isRunning = false;
        this.interval = null;
        this.selectedMinutes = 0;

        this.initElements();
        this.bindEvents();
        this.loadTimerState();

        // 请求与后台同步状态
        this.requestStateSync();

        // 延迟一点再请求状态，确保侧边栏完全加载
        setTimeout(() => {
            this.requestStateSync();
        }, 200);

        // 监听来自background.js的消息
        this.setupMessageListener();
    }

    // 设置消息监听器
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Sidepanel接收到消息:', request.action, request.timeLeft); // 调试日志

            switch (request.action) {
                case 'timerTick':
                    this.timeLeft = request.timeLeft;
                    this.updateDisplay();
                    break;
                case 'timerPaused':
                    console.log('Sidepanel处理timerPaused');
                    this.isRunning = false;
                    this.statusDot.classList.remove('running');
                    this.updateStatus('已暂停');
                    this.updateButtonStates();
                    break;
                case 'timerReset':
                    console.log('Sidepanel处理timerReset');
                    this.isRunning = false;
                    this.statusDot.classList.remove('running', 'warning', 'finished');
                    this.updateStatus('已重置');
                    this.updateDisplay();
                    this.updateButtonStates();
                    break;
                case 'timerFinished':
                    console.log('Sidepanel处理timerFinished');
                    this.isRunning = false;
                    this.statusDot.classList.remove('running');
                    this.statusDot.classList.add('finished');
                    this.updateStatus('时间到！');
                    this.updateButtonStates();
                    // 播放提示音
                    this.playSound();
                    break;
                case 'requestStateSync':
                    console.log('Sidepanel处理requestStateSync');
                    // 这个请求不需要处理，因为我们在requestStateSync中已经处理
                    break;
            }
            return true;
        });
    }

    initElements() {
        this.timeDisplay = document.getElementById('timeDisplay');
        this.statusText = document.getElementById('statusText');
        this.statusDot = document.getElementById('statusDot');
        this.progressFill = document.getElementById('progressFill');
        this.totalTimeDisplay = document.getElementById('totalTimeDisplay');
        this.progressPercent = document.getElementById('progressPercent');
        this.quickBtns = document.querySelectorAll('.quick-btn');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.customTimeInput = document.getElementById('customTimeInput');
        this.setCustomTimeBtn = document.getElementById('setCustomTimeBtn');
    }

    bindEvents() {
        this.quickBtns.forEach(btn => {
            btn.addEventListener('click', () => this.selectTimer(btn));
        });

        this.startBtn.addEventListener('click', () => this.startTimer());
        this.pauseBtn.addEventListener('click', () => this.pauseTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());

        // 添加自定义时间输入事件
        this.setCustomTimeBtn.addEventListener('click', () => this.setCustomTime());
        this.customTimeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.setCustomTime();
            }
        });

        // 添加输入验证
        this.customTimeInput.addEventListener('input', () => {
            this.clearInputValidation();
        });
    }

    selectTimer(btn) {
        if (this.isRunning) return;

        this.quickBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 检查按钮是否有data-seconds属性（优先级更高）
        if (btn.dataset.seconds) {
            this.timeLeft = parseInt(btn.dataset.seconds);
            this.selectedMinutes = 0; // 标记为非分钟预设
            this.totalTime = this.timeLeft;
            this.updateDisplay();

            // 格式化显示文本
            const seconds = this.timeLeft;
            let timeText;
            if (seconds < 60) {
                timeText = seconds + '秒';
            } else {
                const minutes = Math.floor(seconds / 60);
                timeText = minutes + '分钟';
            }
            this.updateStatus('已选择 ' + timeText);
        } else if (btn.dataset.minutes) {
            // 使用data-minutes属性
            this.selectedMinutes = parseInt(btn.dataset.minutes);
            this.timeLeft = this.selectedMinutes * 60;
            this.totalTime = this.timeLeft;
            this.updateDisplay();
            this.updateStatus('已选择 ' + this.selectedMinutes + ' 分钟');
        }

        this.saveTimerState();

        // 通知content script显示悬浮窗
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

    startTimer() {
        if (this.timeLeft <= 0) {
            this.updateStatus('请先选择倒计时时间');
            return;
        }

        // 激活语音合成（用户交互后首次使用需要激活）
        this.activateVoice();

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
        this.statusDot.classList.add('running');
        this.updateStatus('倒计时进行中...');
        this.updateButtonStates();
        this.saveTimerState();
    }

    // 激活语音合成功能
    activateVoice() {
        if ('speechSynthesis' in window) {
            try {
                // 创建一个极短的静音来激活语音权限
                const utterance = new SpeechSynthesisUtterance('');
                utterance.volume = 0;
                speechSynthesis.speak(utterance);
                console.log('Sidepanel: 语音权限已激活');
            } catch (e) {
                console.log('Sidepanel: 语音激活失败:', e);
            }
        }
    }

    pauseTimer() {
        if (!this.isRunning) return;

        // 通知background.js暂停倒计时
        chrome.runtime.sendMessage({
            action: 'pauseTimer'
        });

        this.isRunning = false;
        this.statusDot.classList.remove('running');
        this.updateStatus('已暂停');
        this.updateButtonStates();
        this.saveTimerState();
    }

    resetTimer() {
        // 通知background.js重置倒计时
        chrome.runtime.sendMessage({
            action: 'resetTimer'
        });

        this.isRunning = false;
        this.statusDot.classList.remove('running', 'warning', 'finished');
        this.quickBtns.forEach(b => b.classList.remove('active'));
        this.updateButtonStates();

        // 使用 totalTime 来重置，这样无论是分钟还是秒都能正确重置
        if (this.totalTime > 0) {
            this.timeLeft = this.totalTime;
            this.updateStatus('已重置');
        } else {
            this.timeLeft = 0;
            this.selectedMinutes = 0;
            this.updateStatus('准备就绪');
        }

        this.updateDisplay();
        this.saveTimerState();
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
        this.quickBtns.forEach(b => b.classList.remove('active'));

        // 更新显示
        this.updateDisplay();
        this.updateStatus('已设置自定义时间: ' + this.formatDuration(seconds));

        // 保存状态
        this.saveTimerState();

        // 通知content script显示悬浮窗
        chrome.runtime.sendMessage({
            action: 'showTimerOverlay',
            timeLeft: this.timeLeft
        });

        // 同时通过storage设置初始时间
        chrome.storage.local.set({
            lastUpdateTime: Date.now(),
            lastUpdateTimeValue: this.timeLeft
        });

        // 显示成功状态
        this.showInputSuccess();

        // 清空输入框
        this.customTimeInput.value = '';
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
        this.customTimeInput.classList.add('error');
        this.customTimeInput.classList.remove('success');
        this.updateStatus(message);

        // 3秒后自动清除错误状态
        setTimeout(() => {
            this.clearInputValidation();
        }, 3000);
    }

    // 显示输入成功
    showInputSuccess() {
        this.customTimeInput.classList.add('success');
        this.customTimeInput.classList.remove('error');

        // 2秒后清除成功状态
        setTimeout(() => {
            this.clearInputValidation();
        }, 2000);
    }

    // 清除输入验证状态
    clearInputValidation() {
        this.customTimeInput.classList.remove('error', 'success');
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        this.timeDisplay.textContent = timeString;

        // 更新总时长显示
        const totalMinutes = Math.floor(this.totalTime / 60);
        const totalSeconds = this.totalTime % 60;
        const totalTimeString = `${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;
        this.totalTimeDisplay.textContent = totalTimeString;

        // 更新进度百分比
        const progress = this.totalTime > 0 ? ((this.totalTime - this.timeLeft) / this.totalTime) * 100 : 0;
        this.progressPercent.textContent = `${Math.round(progress)}%`;

        // 更新进度条
        this.progressFill.style.width = `${progress}%`;

        // 更新警告状态
        this.updateWarningState();
    }

    updateWarningState() {
        // 移除所有警告类
        const timerDisplay = document.querySelector('.timer-display');
        timerDisplay.classList.remove('warning', 'critical');

        // 添加相应的警告类
        if (this.timeLeft <= 10 && this.timeLeft > 0) {
            timerDisplay.classList.add('critical');
            this.statusDot.classList.add('finished');
        } else if (this.timeLeft <= 30 && this.timeLeft > 0) {
            timerDisplay.classList.add('warning');
            this.statusDot.classList.add('warning');
        } else {
            this.statusDot.classList.remove('warning', 'finished');
        }
    }

    updateStatus(status) {
        this.statusText.textContent = status;
    }

    updateButtonStates() {
        // 更新暂停按钮状态：当倒计时运行时启用，否则禁用
        if (this.isRunning) {
            this.pauseBtn.disabled = false;
        } else {
            this.pauseBtn.disabled = true;
        }
    }

    playSound() {
        // 使用语音合成API朗读"倒计时结束"
        if ('speechSynthesis' in window) {
            try {
                const utterance = new SpeechSynthesisUtterance('倒计时结束');
                utterance.lang = 'zh-CN'; // 设置为中文
                utterance.volume = 1.0; // 最大音量
                utterance.rate = 0.9; // 语速
                utterance.pitch = 1.0; // 音调

                speechSynthesis.speak(utterance);
                console.log('Sidepanel: 语音播放成功');
            } catch (e) {
                console.log('Sidepanel: 语音播放失败:', e);
            }
        } else {
            console.log('Sidepanel: 浏览器不支持语音合成API');
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
                        this.statusDot.classList.remove('running');
                        this.statusDot.classList.add('finished');
                        this.updateStatus('时间到！');
                    }

                    // 移除startTimer调用，因为倒计时由background.js管理
                    // 如果正在运行，UI会通过消息更新
                }

                // 更新按钮状态
                this.updateButtonStates();
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