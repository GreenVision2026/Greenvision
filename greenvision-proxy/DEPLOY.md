# GreenVision 后端部署说明

## 1. 推荐结构

- 前端：GitHub Pages，部署 `Greenvision.html`
- 后端：Render / Railway / 云函数，部署本目录 `greenvision-proxy`

GitHub Pages 是 HTTPS 页面，所以后端也必须是 HTTPS 地址。

## 2. 后端环境变量

部署后端时，在平台的 Environment Variables 中配置：

```text
API_KEY=你的智谱/大模型 API Key
API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
MODEL=glm-4-flash
CLIENT_KEY=greenvision-secret-key-2024
ALLOWED_ORIGINS=https://你的用户名.github.io
RATE_LIMIT_MAX=50
```

如果你的 GitHub Pages 地址是 `https://abc.github.io/greenvision/`，这里写：

```text
ALLOWED_ORIGINS=https://abc.github.io
```

## 3. 前端连接方式

后端部署成功后，会得到一个 HTTPS 地址，例如：

```text
https://greenvision-proxy.onrender.com
```

然后在 `Greenvision.html` 中找到：

```js
const remoteAssistantConfig = {
  enabled: false,
  endpoint: '',
  clientKey: ''
};
```

改成：

```js
const remoteAssistantConfig = {
  enabled: true,
  endpoint: 'https://greenvision-proxy.onrender.com/api/chat',
  clientKey: 'greenvision-secret-key-2024'
};
```

## 4. 测试接口

浏览器打开：

```text
https://你的后端域名/health
```

如果看到：

```json
{"status":"ok"}
```

说明后端启动成功。

## 5. 注意事项

- 不要把 `.env` 上传到 GitHub。
- 不要把真正的 `API_KEY` 写进 `server.js` 或 `Greenvision.html`。
- 前端里的 `CLIENT_KEY` 不能当作真正安全密钥，它只是简单访问门槛。真正的模型 API Key 必须只放在后端环境变量里。
