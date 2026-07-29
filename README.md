# Shadowrocket iOS 开屏广告拦截套件

这是一套保守的开屏广告规则，覆盖高德地图、航旅纵横、中国国航、京东、淘宝和滴滴。每个 App 都有独立模块，只处理已确认的开屏接口；脚本遇到未知 URL、未知响应结构或无效 JSON 时会原样放行。

## 文件结构

```text
shadowrocket-splash-blocker/
├── modules/
│   ├── airchina.sgmodule
│   ├── amap.sgmodule
│   ├── didi.sgmodule
│   ├── jd.sgmodule
│   ├── taobao.sgmodule
│   └── umetrip.sgmodule
├── scripts/
│   └── splash-blocker.js
├── tests/
│   └── splash-blocker.test.js
└── package.json
```

模块共用 `scripts/splash-blocker.js`，但可以在 Shadowrocket 中逐个启停。本套件不会清理首页信息流、个人中心、活动入口、订单页或追踪请求。

## 1. 直接导入

本仓库已经配置为从以下公开 Raw 地址加载共享脚本：

```text
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/scripts/splash-blocker.js
```

可直接使用以下模块地址：

```text
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/modules/amap.sgmodule
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/modules/umetrip.sgmodule
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/modules/airchina.sgmodule
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/modules/jd.sgmodule
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/modules/taobao.sgmodule
https://raw.githubusercontent.com/timhaiz/shadowrocket-splash-blocker/main/modules/didi.sgmodule
```

如果只是安装使用，可跳到“安装并信任 HTTPS 解密证书”。

## 2. 复刻后自行托管

Shadowrocket 需要通过 HTTPS 地址下载自定义 JavaScript。请把整个目录上传到你自己的 GitHub 或 Gitee 仓库，并保持 `modules/` 与 `scripts/` 的相对位置不变。

先确定 Raw 基础地址。该地址应直接指向包含 `modules` 和 `scripts` 的目录，末尾不要加 `/`。

GitHub 示例：

```text
https://raw.githubusercontent.com/<用户名>/<仓库>/<分支>/shadowrocket-splash-blocker
```

Gitee 示例：

```text
https://gitee.com/<用户名>/<仓库>/raw/<分支>/shadowrocket-splash-blocker
```

如果你把本目录的内容直接放在仓库根目录，则从示例中去掉最后的 `shadowrocket-splash-blocker`。

在六个 `.sgmodule` 中，把全部 `__RAW_BASE_URL__` 替换成你的 Raw 基础地址，然后提交并推送。替换后，以高德模块为例，脚本地址应该类似：

```text
script-path=https://raw.githubusercontent.com/example/repo/main/shadowrocket-splash-blocker/scripts/splash-blocker.js
```

不要直接引用陌生人维护的脚本地址。Shadowrocket 会执行地址中的 JavaScript，使用自己的仓库才能固定和审查实际运行的代码。

## 3. 安装并信任 HTTPS 解密证书

这些 App 的广告接口使用 HTTPS，只有域名规则无法稳定修改响应，需要启用 Shadowrocket 的 HTTPS 解密（MITM）。

1. 在 Shadowrocket 的 HTTPS 解密设置中生成新的 CA 证书并安装。
2. 打开 iOS“设置”，安装已下载的描述文件。
3. 前往“设置 → 通用 → 关于本机 → 证书信任设置”，为该 CA 开启完全信任。
4. 回到 Shadowrocket，确认 HTTPS 解密已启用。

请勿导出、共享或上传 CA 的私钥。每个模块只声明该 App 所需的最小 MITM 域名；停用模块后，对应域名也不再需要解密。

## 4. 导入模块

将每个模块的 Raw 地址添加到 Shadowrocket 的“模块”或“配置模块”页面。例如：

```text
<你的 Raw 基础地址>/modules/amap.sgmodule
```

建议按照以下顺序逐个导入、启用和验证，不要第一次就同时打开全部模块：

1. 高德地图 `amap.sgmodule`
2. 航旅纵横 `umetrip.sgmodule`
3. 中国国航 `airchina.sgmodule`
4. 京东 `jd.sgmodule`
5. 淘宝 `taobao.sgmodule`
6. 滴滴 `didi.sgmodule`

启用一个模块后，先从多任务界面完全退出对应 App，再冷启动两次。若仍出现旧广告，通常是 App 已缓存开屏素材：优先使用 App 自带的清缓存功能；最后才考虑重装。

> 重装 App 可能清除登录状态、离线地图、行程缓存和本地设置。请先确认重要数据已经同步，不要为了测试规则直接卸载。

## 5. 真机验收

逐个模块检查以下两类结果：

- 冷启动两次，不再显示图片或视频开屏广告，也没有长时间空白倒计时。
- 主流程正常：高德导航与搜索、航旅纵横行程查询、国航登录、京东/淘宝商品及订单页、滴滴定位及叫车页均可使用。

如果某个 App 更新后出现异常，先只停用该 App 的模块。脚本采用失败开放策略，但服务端接口变更仍可能让精确规则失效；此时不要扩大到整个业务域名进行拦截。

## 6. 本地测试

测试只使用 Node.js 内置模块，不需要安装依赖：

```bash
cd /Users/zhang/Documents/Playground/shadowrocket-splash-blocker
npm test
```

测试覆盖六个 App 的已知响应、非 JSON、空响应、未知字段、未知请求头，以及模块的固定 Raw 地址和 MITM 域名清单。

## 支持范围

| App | 处理内容 | 明确不处理 |
| --- | --- | --- |
| 高德地图 | `splash_screen`、`startup/init` | 搜索、导航、打车页推广 |
| 航旅纵横 | 已知广告位 `Rpid`、开屏素材 | 普通 `native` 业务请求 |
| 中国国航 | `queryOpenScreenAd` | 航班、订单、升级检查等网关过程 |
| 京东 | `functionId=start` 中已识别的开屏字段 | 首页、物流、订单和个人中心 |
| 淘宝 | 图片及视频开屏接口 | 通用弹层、首页推荐和活动入口 |
| 滴滴 | 已知启动/活动广告入口 | 首页、个人中心、叫车和订单接口 |

版本：`1.0.0`
