// 内容脚本，用于在页面上显示倒计时提醒
class ContentScriptManager {
    constructor() {
        this.observer = null;
        this.currentTimer = null;
    }

    init() {
        this.setupMessageListener();
        // 延迟一点再检查状态，确保DOM完全加载
        setTimeout(() => {
            this.checkTimerState();
            // 启动storage监听器
            this.startStorageListener();
        }, 200);
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Content接收到消息:', request.action, request.timeLeft); // 调试日志

            switch (request.action) {
                case 'timerTick':
                    console.log('Content处理timerTick:', this.formatTime(request.timeLeft));
                    this.updateTimerOverlay(request.timeLeft);
                    break;
                case 'timerWarning':
                    console.log('Content处理timerWarning，剩余10秒');
                    // 播放警告音效
                    this.playWarningSound();
                    break;
                case 'timerPaused':
                    console.log('Content处理timerPaused');
                    this.hideTimerOverlay();
                    break;
                case 'timerReset':
                    console.log('Content处理timerReset');
                // 重置时检查timerState：
                // - 如果有总时长，则用总时长重绘一个“初始状态”的悬浮框
                // - 否则隐藏悬浮框
                chrome.storage.local.get(['timerState'], (result) => {
                    if (result.timerState && result.timerState.totalTime > 0) {
                        const state = result.timerState;
                        const resetTime = state.totalTime;
                        this.showTimerOverlay(resetTime);

                        // 强制把状态文字恢复为初始文案，避免停留在“倒计时结束”
                        const overlay = document.getElementById('meeting-timer-overlay');
                        if (overlay) {
                            const statusElement = overlay.querySelector('.timer-status');
                            if (statusElement) {
                                statusElement.textContent = '计时器';
                            }
                            const progressElement = overlay.querySelector('.timer-progress');
                            if (progressElement) {
                                progressElement.textContent = this.getProgressText(resetTime);
                            }
                        }
                    } else {
                        // 没有设置时间，隐藏悬浮窗
                        this.hideTimerOverlay();
                    }
                });
                    break;
                case 'timerFinished':
                    console.log('Content处理timerFinished');
                    // 倒计时结束时，立即更新悬浮窗状态
                    this.updateTimerOverlay(0);
                    // 显示完成通知
                    this.showFinishNotification();
                    break;
                case 'showTimerOverlay':
                    console.log('Content处理showTimerOverlay:', this.formatTime(request.timeLeft));
                    // 新消息：显示悬浮窗
                    this.showTimerOverlay(request.timeLeft);
                    // 确保设置正确的运行状态
                    if (!this.currentTimer) {
                        this.showTimerOverlay(request.timeLeft);
                    }
                    break;
                case 'timerStateSync':
                    // 新消息：处理状态同步
                    console.log('Content处理timerStateSync');
                    if (request.state) {
                        this.handleStateSync(request.state);
                    }
                    break;
            }
            return true;
        });
    }

    checkTimerState() {
        chrome.storage.local.get(['timerState'], (result) => {
            if (result.timerState) {
                const state = result.timerState;
                // 如果倒计时有设置（timeLeft > 0），就显示悬浮窗
                if (state.timeLeft > 0) {
                    this.showTimerOverlay(state.timeLeft);
                    // 如果正在运行，添加运行状态样式
                    if (state.isRunning) {
                        this.currentTimer?.classList.add('running');
                        this.currentTimer?.classList.remove('finished');
                    } else {
                        // 如果未运行，移除运行状态样式
                        this.currentTimer?.classList.remove('running');
                    }
                } else if (state.timeLeft === 0 && !state.isRunning && state.totalTime > 0) {
                    // 倒计时已结束，显示完成状态
                    this.showTimerOverlay(0);
                }
            }
        });
    }

    // 更新倒计时悬浮窗
    updateTimerOverlay(timeLeft) {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (!overlay) {
            this.showTimerOverlay(timeLeft);
            return;
        }

        // 更新时间显示
        const timeElement = overlay.querySelector('.timer-time');
        if (timeElement) {
            timeElement.textContent = this.formatTime(timeLeft);
            console.log('悬浮窗时间更新:', this.formatTime(timeLeft)); // 调试日志
        }

        // 更新进度文字
        const progressElement = overlay.querySelector('.timer-progress');
        if (progressElement) {
            progressElement.textContent = this.getProgressText(timeLeft);
        }

        // 更新警告状态
        this.updateWarningState(timeLeft);

        // 更新运行状态样式
        if (timeLeft > 0) {
            // 倒计时进行中
            overlay.classList.add('running');
            overlay.classList.remove('finished');
        } else {
            // 倒计时结束
            overlay.classList.remove('running');
            overlay.classList.add('finished');
            // 更新状态文字
            const statusElement = overlay.querySelector('.timer-status');
            if (statusElement) {
                statusElement.textContent = '倒计时结束';
            }
        }
    }

    showTimerOverlay(timeLeft) {
        this.removeTimerOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'meeting-timer-overlay';
        overlay.innerHTML = `
            <div class="timer-content">
                <div class="timer-time">${this.formatTime(timeLeft)}</div>
                <div class="timer-status">计时器</div>
                <div class="timer-progress">${this.getProgressText(timeLeft)}</div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentTimer = overlay;

        // 添加样式
        this.addTimerStyles();

        // 确保始终在视口中可见
        this.ensureTimerVisibility();

        // 添加滚动监听器
        this.addScrollListener();

        // 添加页面可见性变化监听器
        this.addVisibilityListener();

        // 初始化警告状态
        this.updateWarningState(timeLeft);

        // 添加运行状态样式
        this.currentTimer.classList.add('running');

        // 添加拖拽功能
        this.addDragFunctionality();
    }

    hideTimerOverlay() {
        this.removeTimerOverlay();
    }

    removeTimerOverlay() {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (overlay) {
            overlay.remove();
        }
        this.currentTimer = null;
    }

    // 添加拖拽功能
    addDragFunctionality() {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (!overlay) return;

        console.log('初始化拖拽功能');

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isDragging = false;

        // 鼠标按下事件 - 直接在overlay上
        overlay.onmousedown = function(e) {
            console.log('鼠标按下事件触发');
            e.preventDefault();
            e.stopPropagation();

            // 获取鼠标初始位置
            pos3 = e.clientX;
            pos4 = e.clientY;

            // 标记为拖拽状态
            isDragging = true;

            // 添加拖拽中的样式
            overlay.style.cursor = 'grabbing';
            overlay.style.transition = 'none';
            overlay.style.willChange = 'left, top';

            // 移除动画
            overlay.style.animation = 'none';

            console.log('开始拖拽, 初始位置:', { pos3, pos4 });
        };

        // 鼠标移动事件 - 在document上监听
        document.onmousemove = function(e) {
            if (!isDragging) return;

            e.preventDefault();

            // 计算新位置
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            // 设置新位置
            const newTop = overlay.offsetTop - pos2;
            const newLeft = overlay.offsetLeft - pos1;

            overlay.style.top = newTop + 'px';
            overlay.style.left = newLeft + 'px';

            console.log('拖拽中, 位置:', { top: newTop, left: newLeft });
        };

        // 鼠标释放事件
        document.onmouseup = function() {
            if (isDragging) {
                console.log('拖拽结束');
                isDragging = false;

                // 恢复样式
                overlay.style.cursor = 'move';
                overlay.style.transition = 'all 0.2s ease';
                overlay.style.willChange = 'auto';

                // 恢复动画
                overlay.style.animation = 'slideInLeft 0.3s ease-out';
            }
        };
    }

    showFinishNotification() {
        // 激活语音合成
        this.activateVoice();

        // 创建完成通知
        const notification = document.createElement('div');
        notification.id = 'meeting-timer-finish';
        notification.innerHTML = `
            <div class="finish-content">
                <div class="finish-icon">⏰</div>
                <div class="finish-text">汇报时间已到！</div>
                <div class="finish-tips">请及时结束汇报</div>
            </div>
        `;

        document.body.appendChild(notification);

        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);

        this.addFinishStyles();
        this.removeScrollListeners();

        // 播放完成提示音
        this.playDoneAudio();
    }

    // 播放完成音频
    playDoneAudio() {
        // 使用Audio API播放done.mp3音频文件
        try {
            // 从扩展中获取音频文件URL
            const audioUrl = chrome.runtime.getURL('sounds/done.mp3');
            const audio = new Audio(audioUrl);
            audio.volume = 1.0; // 最大音量

            audio.play().then(() => {
                console.log('Content: 音频播放成功');
            }).catch(error => {
                console.log('Content: 音频播放失败:', error);
            });
        } catch (e) {
            console.log('Content: 音频播放异常:', e);
        }
    }

    // 播放警告音效（剩余10秒时）
    playWarningSound() {
        try {
            // 从扩展中获取音频文件URL
            const audioUrl = chrome.runtime.getURL('sounds/done.mp3');
            const audio = new Audio(audioUrl);
            audio.volume = 1.0; // 最大音量

            audio.play().then(() => {
                console.log('Content: 警告音效播放成功');
            }).catch(error => {
                console.log('Content: 警告音效播放失败:', error);
            });
        } catch (e) {
            console.log('Content: 警告音效播放异常:', e);
        }
    }

    // 播放语音播报
    playSpeech() {
        if ('speechSynthesis' in window) {
            try {
                const utterance = new SpeechSynthesisUtterance('倒计时结束、有请下一位');
                utterance.lang = 'zh-CN'; // 设置为中文
                utterance.volume = 1.0; // 最大音量
                utterance.rate = 0.9; // 语速
                utterance.pitch = 1.0; // 音调
                chrome.storage.local.get(['speechPlayed'], (result) => {
                    if (result.speechPlayed) {
                        console.log('Content: 本轮倒计时语音已播过，跳过');
                        return;
                    }
                    chrome.storage.local.set({ speechPlayed: true }, () => {
                        speechSynthesis.speak(utterance);
                        console.log('Content: 语音播报成功');
                    });
                });
            } catch (e) {
                console.log('Content: 语音播报失败:', e);
            }
        } else {
            console.log('Content: 浏览器不支持语音合成API');
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    getProgressText(timeLeft) {
        if (timeLeft > 30) return "正常进行";
        if (timeLeft > 10) return "注意时间";
        if (timeLeft > 0) return "即将结束";
        return "倒计时结束";
    }

    // 更新警告状态
    updateWarningState(timeLeft) {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (!overlay) return;

        // 移除所有警告类
        overlay.classList.remove('warning', 'critical');

        // 添加相应的警告类
        if (timeLeft <= 10 && timeLeft > 0) {
            overlay.classList.add('critical');
            // 添加红晕效果
            this.addGlowEffect(overlay, 'critical');
        } else if (timeLeft <= 30 && timeLeft > 0) {
            overlay.classList.add('warning');
            // 添加橙晕效果
            this.addGlowEffect(overlay, 'warning');
        } else {
            // 移除光晕效果
            this.removeGlowEffect(overlay);
        }
    }

    // 添加光晕效果
    addGlowEffect(element, type) {
        this.removeGlowEffect(element);

        const glowStyle = document.createElement('style');
        glowStyle.id = `timer-glow-${type}`;

        if (type === 'critical') {
            glowStyle.textContent = `
                #meeting-timer-overlay.critical {
                    box-shadow: 0 0 20px rgba(244, 67, 54, 0.8),
                                0 0 40px rgba(244, 67, 54, 0.6),
                                0 0 60px rgba(244, 67, 54, 0.4) !important;
                    animation: pulse-glow 1s infinite;
                }

                @keyframes pulse-glow {
                    0%, 100% {
                        box-shadow: 0 0 20px rgba(244, 67, 54, 0.8),
                                    0 0 40px rgba(244, 67, 54, 0.6),
                                    0 0 60px rgba(244, 67, 54, 0.4);
                    }
                    50% {
                        box-shadow: 0 0 30px rgba(244, 67, 54, 1),
                                    0 0 50px rgba(244, 67, 54, 0.8),
                                    0 0 70px rgba(244, 67, 54, 0.6);
                    }
                }
            `;
        } else if (type === 'warning') {
            glowStyle.textContent = `
                #meeting-timer-overlay.warning {
                    box-shadow: 0 0 15px rgba(255, 152, 0, 0.8),
                                0 0 30px rgba(255, 152, 0, 0.6),
                                0 0 45px rgba(255, 152, 0, 0.4) !important;
                    animation: pulse-glow 1.5s infinite;
                }

                @keyframes pulse-glow {
                    0%, 100% {
                        box-shadow: 0 0 15px rgba(255, 152, 0, 0.8),
                                    0 0 30px rgba(255, 152, 0, 0.6),
                                    0 0 45px rgba(255, 152, 0, 0.4);
                    }
                    50% {
                        box-shadow: 0 0 20px rgba(255, 152, 0, 1),
                                    0 0 40px rgba(255, 152, 0, 0.8),
                                    0 0 60px rgba(255, 152, 0, 0.6);
                    }
                }
            `;
        }

        document.head.appendChild(glowStyle);
    }

    // 移除光晕效果
    removeGlowEffect(element) {
        const criticalGlow = document.getElementById('timer-glow-critical');
        const warningGlow = document.getElementById('timer-glow-warning');

        if (criticalGlow) {
            criticalGlow.remove();
        }

        if (warningGlow) {
            warningGlow.remove();
        }
    }

    addTimerStyles() {
        if (document.getElementById('meeting-timer-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'meeting-timer-styles';
        styles.textContent = `
            #meeting-timer-overlay {
                position: fixed !important;
                top: 20px !important;
                left: 20px !important;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 15px 20px;
                border-radius: 10px;
                z-index: 2147483647 !important;
                font-family: 'Microsoft YaHei', Arial, sans-serif;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                animation: slideInLeft 0.3s ease-out;
                cursor: move !important;
                min-width: 140px;
                transform: translateZ(0);
                will-change: transform;
                transition: all 0.2s ease;
            }

            .timer-content {
                text-align: center;
                min-width: 120px;
            }

            .timer-time {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 5px;
                font-family: 'Courier New', monospace;
            }

            .timer-status {
                font-size: 12px;
                opacity: 0.8;
            }

            .timer-progress {
                font-size: 10px;
                opacity: 0.6;
                margin-top: 3px;
                color: #4CAF50;
                font-weight: 500;
            }

            .timer-overlay.warning .timer-progress {
                color: #FF9800;
            }

            .timer-overlay.critical .timer-progress {
                color: #F44336;
            }

            /* 已移到动态生成的光晕效果中 */

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideInLeft {
                from {
                    transform: translateX(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes pulse {
                0%, 100% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.05);
                }
            }

            .warning {
                background: rgba(243, 156, 18, 0.9) !important;
                color: white !important;
                animation: pulse 1s infinite;
            }

            .critical {
                background: rgba(231, 76, 60, 0.9) !important;
                color: white !important;
                animation: pulse 0.5s infinite;
            }

            .finished {
                background: rgba(76, 175, 80, 0.9) !important;
                color: white !important;
            }
        `;

        document.head.appendChild(styles);
    }

    addFinishStyles() {
        if (document.getElementById('meeting-timer-finish-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'meeting-timer-finish-styles';
        styles.textContent = `
            #meeting-timer-finish {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%);
                background: rgba(231, 76, 60, 0.95);
                color: white;
                padding: 20px 30px;
                border-radius: 15px;
                z-index: 2147483647 !important;
                font-family: 'Microsoft YaHei', Arial, sans-serif;
                backdrop-filter: blur(10px);
                border: 2px solid rgba(255, 255, 255, 0.3);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                animation: popIn 0.5s ease-out;
                pointer-events: none !important;
                transform: translateZ(0);
            }

            .finish-content {
                text-align: center;
            }

            .finish-icon {
                font-size: 48px;
                margin-bottom: 10px;
            }

            .finish-text {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 8px;
            }

            .finish-tips {
                font-size: 12px;
                opacity: 0.8;
            }

            @keyframes popIn {
                0% {
                    transform: translate(-50%, -50%) scale(0);
                    opacity: 0;
                }
                50% {
                    transform: translate(-50%, -50%) scale(1.1);
                }
                100% {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 1;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    // 确保倒计时始终在视口中可见
    ensureTimerVisibility() {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (!overlay) return;

        // 确保z-index是最高的
        overlay.style.zIndex = '2147483647';

        // 允许拖拽，移除pointer-events: none
        overlay.style.transform = 'translateZ(0)';
    }

    // 添加滚动监听器
    addScrollListener() {
        window.addEventListener('scroll', this.handleScroll.bind(this));
        window.addEventListener('resize', this.handleScroll.bind(this));
    }

    // 移除滚动监听器
    removeScrollListeners() {
        window.removeEventListener('scroll', this.handleScroll.bind(this));
        window.removeEventListener('resize', this.handleScroll.bind(this));
    }

    // 处理滚动事件
    handleScroll() {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (overlay) {
            // 保持fixed定位，但不强制重置位置（允许拖拽）
            overlay.style.position = 'fixed';
            // 移除强制位置设置，让用户可以自由拖拽

            // 添加防抖优化
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.ensureTimerVisibility();
            }, 50);
        }
    }

    // 添加页面可见性变化监听器
    addVisibilityListener() {
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    // 启动storage监听器
    startStorageListener() {
        // 监听storage变化
        try {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                try {
                    if (namespace === 'local' && changes.lastUpdateTime) {
                        const updateTimeValue = changes.lastUpdateTimeValue ? changes.lastUpdateTimeValue.newValue : null;
                        if (updateTimeValue !== null && !isNaN(updateTimeValue)) {
                            console.log('Storage接收到时间更新:', this.formatTime(updateTimeValue));
                            this.updateTimerOverlay(updateTimeValue);
                        }
                    }
                } catch (e) {
                    console.log('Storage监听器错误:', e);
                    // 如果扩展上下文失效，清理监听器
                    this.cleanup();
                }
            });

            // 定期检查storage获取最新时间
            this.storageInterval = setInterval(() => {
                this.checkStorageForUpdates();
            }, 1000);
        } catch (e) {
            console.log('Storage初始化失败:', e);
            this.cleanup();
        }
    }

    // 检查storage更新
    checkStorageForUpdates() {
        try {
            chrome.storage.local.get(['timerState', 'lastUpdateTimeValue'], (result) => {
                try {
                    if (result.timerState && result.timerState.isRunning) {
                        const currentTime = Date.now();
                        const lastUpdate = result.lastUpdateTime || 0;

                        // 如果超过2秒没有更新，可能消息传递失败，通过storage同步
                        if (currentTime - lastUpdate > 2000) {
                            const updateTimeValue = result.lastUpdateTimeValue;
                            if (updateTimeValue !== null && !isNaN(updateTimeValue)) {
                                console.log('通过Storage同步时间:', this.formatTime(updateTimeValue));
                                this.updateTimerOverlay(updateTimeValue);
                            }
                        }
                    }
                } catch (e) {
                    console.log('Storage处理错误:', e);
                    this.cleanup();
                }
            });
        } catch (e) {
            console.log('Storage访问错误:', e);
            this.cleanup();
        }
    }

    // 处理页面可见性变化
    handleVisibilityChange() {
        const overlay = document.getElementById('meeting-timer-overlay');
        if (overlay && document.hidden) {
            // 页面隐藏时保持倒计时可见
            overlay.style.opacity = '0.9';
        } else if (overlay) {
            // 页面显示时恢复正常
            overlay.style.opacity = '1';
        }
    }

    // 清理资源
    cleanup() {
        try {
            if (this.storageInterval) {
                clearInterval(this.storageInterval);
                this.storageInterval = null;
            }

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            // 移除事件监听器
            window.removeEventListener('scroll', this.handleScroll.bind(this));
            window.removeEventListener('resize', this.handleScroll.bind(this));
            document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        } catch (e) {
            console.log('清理资源时出错:', e);
        }
    }

    // 处理状态同步
    handleStateSync(state) {
        if (state.timeLeft > 0) {
            this.showTimerOverlay(state.timeLeft);
            // 如果正在运行，添加运行状态样式
            if (state.isRunning) {
                this.currentTimer?.classList.add('running');
            } else {
                // 如果未运行，移除运行状态样式
                this.currentTimer?.classList.remove('running');
            }
        }
    }
}

// 初始化内容脚本管理器
const contentScriptManager = new ContentScriptManager();
contentScriptManager.init();