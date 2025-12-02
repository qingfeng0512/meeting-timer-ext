# 调试和修复文档

## 🔧 已修复的问题

### 1. Extension Context Invalidated 错误

#### 问题表现
```
content.js:525 Uncaught Error: Extension context invalidated.
```

#### 修复方案
添加了完整的错误处理和资源清理机制：

```javascript
// 启动storage监听器
startStorageListener() {
    try {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            try {
                // 监听逻辑
            } catch (e) {
                console.log('Storage监听器错误:', e);
                this.cleanup();
            }
        });
    } catch (e) {
        console.log('Storage初始化失败:', e);
        this.cleanup();
    }
}

// 清理资源
cleanup() {
    try {
        if (this.storageInterval) {
            clearInterval(this.storageInterval);
            this.storageInterval = null;
        }
        // ... 其他清理逻辑
    } catch (e) {
        console.log('清理资源时出错:', e);
    }
}
```

### 2. 倒计时声音不播放问题

#### 问题表现
倒计时结束时没有声音提示

#### 修复方案
增强了声音播放功能，添加了详细的调试信息：

```javascript
function playNotificationSound() {
    console.log('开始播放提示音'); // 调试日志

    const audio = new Audio();
    audio.src = chrome.runtime.getURL('sounds/done.mp3');
    audio.volume = 0.8;

    audio.play().then(() => {
        console.log('音频播放成功');
    }).catch(function(error) {
        console.log('音频播放失败:', error);
        playBackupSound();
    });
}
```

### 3. 倒计时数字不变化问题

#### 问题表现
侧边栏中的倒计时数字没有实时更新

#### 修复方案
完善了消息传递机制：

#### Background.js 修复
```javascript
function startTimer(data) {
    console.log('Background: 启动倒计时，初始时间:', formatTime(timerState.timeLeft));

    timerState.interval = setInterval(() => {
        timerState.timeLeft--;
        const timeLeftValue = timerState.timeLeft;
        console.log('Background: 倒计时更新，剩余时间:', formatTime(timeLeftValue));

        // 发送消息给侧边栏
        chrome.runtime.sendMessage({
            action: 'timerTick',
            timeLeft: timeLeftValue
        });
    }, 1000);
}
```

#### Sidepanel.js 修复
```javascript
setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Sidepanel接收到消息:', request.action, request.timeLeft);

        switch (request.action) {
            case 'timerTick':
                this.timeLeft = request.timeLeft;
                this.updateDisplay();
                break;
        }
    });
}
```

## 🧪 测试步骤

### 1. 重新加载扩展
1. 打开 `chrome://extensions/`
2. 找到你的扩展
3. 点击"重新加载"按钮 🔄

### 2. 测试倒计时功能
1. 点击插件图标打开侧边栏
2. 设置1分钟倒计时
3. 点击"开始"
4. 观察侧边栏数字是否每秒减少
5. 观察悬浮窗是否同步更新

### 3. 测试声音播放
1. 等待倒计时结束
2. 检查是否有声音提示
3. 检查是否有桌面通知

### 4. 测试错误处理
1. 重新加载扩展
2. 打开网页
3. 检查控制台是否还有 context invalidated 错误

## 🔍 调试信息

### 查看控制台
- **侧边栏**: 右键点击侧边栏 → 检查 → Console
- **背景脚本**: chrome://extensions → 点击"服务工作线程" → Console
- **网页**: 右键点击网页 → 检查 → Console

### 期望的日志输出

#### Background.js
```
Background: 启动倒计时，初始时间: 01:00
Background: 倒计时更新，剩余时间: 00:59
Background: 倒计时更新，剩余时间: 00:58
...
Background: 开始播放提示音
音频播放成功
```

#### Sidepanel.js
```
Sidepanel: 启动倒计时，时间: 01:00
Sidepanel接收到消息: timerTick 00:59
Sidepanel处理timerTick: 00:59
Sidepanel接收到消息: timerTick 00:58
Sidepanel处理timerTick: 00:58
```

#### Content.js
```
Content接收到消息: showTimerOverlay 01:00
Content处理showTimerOverlay: 01:00
Content接收到消息: timerTick 00:59
Content处理timerTick: 00:59
```

## 🚨 常见问题

### 问题1: 扩展无法加载
**解决方案**: 检查manifest.json语法，确保所有权限都正确配置

### 问题2: 声音不播放
**解决方案**:
- 检查sounds/done.mp3文件是否存在
- 检查浏览器是否允许音频播放
- 查看控制台是否有音频错误

### 问题3: 消息传递失败
**解决方案**:
- 检查是否有重复的消息监听器
- 确保所有文件路径正确
- 查看控制台的错误信息

## 🎯 成功标准

修复完成后，你应该看到：

1. ✅ 没有 context invalidated 错误
2. ✅ 倒计时数字每秒更新
3. ✅ 倒计时结束时播放声音
4. ✅ 悬浮窗与侧边栏同步
5. ✅ 所有调试日志正常输出