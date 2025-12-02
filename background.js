// 倒计时状态管理
let timerState = {
    timeLeft: 0,
    totalTime: 0,
    isRunning: false,
    selectedMinutes: 0,
    interval: null
};

// 处理来自侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startTimer':
            startTimer(request.data);
            break;
        case 'pauseTimer':
            pauseTimer();
            break;
        case 'resetTimer':
            resetTimer();
            break;
        case 'getState':
            sendResponse({ state: timerState });
            break;
        case 'updateState':
            updateTimerState(request.data);
            break;
        case 'requestStateSync':
            // 发送当前状态给侧边栏
            sendResponse({ state: timerState });
            break;
    }
    return true;
});

// 处理扩展图标点击
chrome.action.onClicked.addListener((tab) => {
    // 打开侧边栏
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// 启动倒计时
function startTimer(data) {
    if (timerState.isRunning) return;

    timerState.timeLeft = data.timeLeft;
    timerState.totalTime = data.totalTime;
    timerState.isRunning = true;
    timerState.selectedMinutes = data.selectedMinutes;

    // 新一轮倒计时开始，重置语音播报标记
    chrome.storage.local.set({ speechPlayed: false });

    console.log('Background: 启动倒计时，初始时间:', formatTime(timerState.timeLeft)); // 调试日志

    timerState.interval = setInterval(() => {
        timerState.timeLeft--;
        const timeLeftValue = timerState.timeLeft;
        console.log('Background: 倒计时更新，剩余时间:', formatTime(timeLeftValue)); // 调试日志

        saveTimerState();

        // 通知popup更新显示
        chrome.runtime.sendMessage({
            action: 'timerTick',
            timeLeft: timeLeftValue
        }).catch(error => {
            // 如果popup关闭，忽略错误
            console.log('Popup已关闭，无法发送消息:', error);
        });

        // 通知content script更新悬浮窗
        chrome.runtime.sendMessage({
            action: 'timerTick',
            timeLeft: timeLeftValue
        }).catch(error => {
            // 如果content script不存在，忽略错误
            console.log('Content script无法接收消息:', error);
        });

        // 通过storage备份消息传递（确保同步）
        const updateData = {
            lastUpdateTime: Date.now(),
            lastUpdateTimeValue: timerState.timeLeft
        };
        chrome.storage.local.set(updateData);
        console.log('Background: 存储更新数据:', updateData); // 调试日志

        // 倒计时剩余10秒时发送警告
        if (timerState.timeLeft === 10) {
            console.log('Background: 倒计时剩余10秒，发送警告');
            chrome.runtime.sendMessage({
                action: 'timerWarning'
            }).catch(error => {
                console.log('警告消息发送失败:', error);
            });
        }

        if (timerState.timeLeft <= 0) {
            finishTimer();
        }
    }, 1000);

    saveTimerState();
}

// 格式化时间函数
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 暂停倒计时
function pauseTimer() {
    if (!timerState.isRunning) return;

    timerState.isRunning = false;
    clearInterval(timerState.interval);
    saveTimerState();

    // 通知popup
    chrome.runtime.sendMessage({
        action: 'timerPaused'
    }).catch(error => {
        // 如果popup关闭，忽略错误
        console.log('Popup已关闭，无法发送消息:', error);
    });

    // 通知content script
    chrome.runtime.sendMessage({
        action: 'timerPaused'
    }).catch(error => {
        // 如果content script不存在，忽略错误
        console.log('Content script无法接收消息:', error);
    });
}

// 重置倒计时
function resetTimer() {
    timerState.isRunning = false;
    clearInterval(timerState.interval);

    // 使用 totalTime 来重置，这样无论是分钟还是秒都能正确重置
    if (timerState.totalTime > 0) {
        timerState.timeLeft = timerState.totalTime;
    } else {
        timerState.timeLeft = 0;
        timerState.selectedMinutes = 0;
    }

    saveTimerState();

    // 重置语音播报标记，确保下一次倒计时可以再次播报
    chrome.storage.local.set({ speechPlayed: false });

    // 通知popup
    chrome.runtime.sendMessage({
        action: 'timerReset'
    }).catch(error => {
        // 如果popup关闭，忽略错误
        console.log('Popup已关闭，无法发送消息:', error);
    });

    // 通知content script
    chrome.runtime.sendMessage({
        action: 'timerReset'
    }).catch(error => {
        // 如果content script不存在，忽略错误
        console.log('Content script无法接收消息:', error);
    });
}

// 完成倒计时
function finishTimer() {
    timerState.isRunning = false;
    timerState.timeLeft = 0;
    clearInterval(timerState.interval);
    saveTimerState();

    // 发送通知
    showNotification();

    // 注意：不在background.js中播放音频，因为background script没有音频播放权限
    // 音频将由content script播放

    // 通知popup显示完成状态
    chrome.runtime.sendMessage({
        action: 'timerFinished'
    }).catch(error => {
        // 如果popup关闭，忽略错误
        console.log('Popup已关闭，无法发送消息:', error);
    });

    // 通知content script显示完成状态（并播放音频）
    chrome.runtime.sendMessage({
        action: 'timerFinished'
    }).catch(error => {
        // 如果content script不存在，忽略错误
        console.log('Content script无法接收消息:', error);
    });
}

// 更新倒计时状态
function updateTimerState(newState) {
    timerState = { ...timerState, ...newState };
    saveTimerState();
}

// 保存状态到chrome.storage
function saveTimerState() {
    chrome.storage.local.set({ timerState: timerState });
}

// 加载状态从chrome.storage
function loadTimerState() {
    chrome.storage.local.get(['timerState'], (result) => {
        if (result.timerState) {
            timerState = result.timerState;
        }
    });
}

// 显示桌面通知
function showNotification() {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '计时器',
        message: '时间已到！',
        requireInteraction: true
    });
}

// 清理资源
chrome.runtime.onSuspend.addListener(() => {
    if (timerState.interval) {
        clearInterval(timerState.interval);
    }
});

// 初始化
loadTimerState();