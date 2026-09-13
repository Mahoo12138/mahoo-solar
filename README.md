# Solar Apartment

「我的小区」公寓光伏数字孪生，使用 React、Three.js / React Three Fiber、SunCalc 与 Open-Meteo。

## 运行

```sh
pnpm install
pnpm dev --host 127.0.0.1
pnpm build
pnpm test
```

测试使用 Node 自带的 TypeScript 类型剥离功能，要求 Node 22.6+（当前验证版本 22.14）。无需另装测试框架。

## 楼栋与方向

以用户最后提供的「上北下南」地图为依据，覆盖此前旋转地图的判断：C1 西北、C2 东北、C3 南侧；C2 住户在东侧立面靠南端，临湖湘路。

- C1：21 层、63 m。
- C2：20 层、60 m。
- C3：32 层、96 m。
- 标准层高 3 m。住户楼层暂沿用旧项目的 11F，可在界面修改。
- 窗户外法线暂按正北顺时针 105°估算，可用方位角滑块校准；这会同步旋转小区与窗户，保持安装在立面上。之前根据旋转地图推断的南向 195°不再使用。
- 楼栋平面尺寸、间距、B2 裙楼尺寸、屋顶设备和绿化是比例示意，不是测绘数据。邻近地图之外的楼栋暂未纳入。

`apps/web/src/lib/buildings.ts` 保存共享几何。计算坐标采用 +X 东、+Y 上、+Z 北；渲染边界转换为 Three.js 的 −Z 北，因此北向俯视不会左右镜像。北向视图锁定旋转，支持缩放和平移。

## 天气与功率

[Open-Meteo 公开天气预报接口](https://open-meteo.com/en/docs)无需前端密钥。位置沿用原项目经纬度 28.233525, 112.865634，尚未重新测定坐标。请求所选北京时间日期及下一日（用于 23:00 之后插值），读取逐小时气温、云量、降水、降雪、风速、风向、WMO 天气码以及 instant GHI/DNI/DHI 辐照。数据按 CC BY 4.0 标注来源。

仅所选日期等于北京时间的当前日期时启用天气接口，每 10 分钟刷新，可手动重试。选择过去或未来日期会取消请求、隐藏接口选项并使用明确标注的模拟天气；切回当天恢复接口或有效缓存。请求有 12 秒超时、取消和内存缓存。当天网络失败或辐照缺失时明确显示「晴空回退」；不拿其他日期的天气充当该日天气。晴、阴、雨、雪、雾模拟均明确标为非实况，并驱动同一套场景和功率状态。

垂直面功率使用以下近似：

```text
板面辐照 = DNI × max(0, 太阳与面板法线点积) × 未遮挡面积
          + DHI × 0.5 + GHI × 地面反照率 0.2 × 0.5
有效辐照 = 板面辐照 × 玻璃透过率 0.8
估算板温 = 气温 + 有效辐照 / (25 + 6.84 × 风速[m/s])
温度修正 = 1 − 0.004 × (板温 − 25)
功率 = 320 W × 有效辐照 / 1000 × 温度修正 × 系统效率 0.92
```

功率限制为 0–320 W，太阳落下时为 0。参考 [PVPMC 的辐照与温度功率模型](https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/point-value-models/pvwatts/)进行简化，并非完整 PVWatts 实现。天气接口的 DNI/DHI 已包含云雨影响，不再次套用云量折减。

每次功率计算都从面板发射 96 条射线，检测楼栋主体与窗框遮挡。装饰屋顶设备、树木、窗外其他楼栋、天空视域遮挡、组件串联失配、积雪覆盖与室内温升未进行精细建模。功率不是设备实测。

左侧电能仓面板按酷态科电能仓 600（PS600N）公开规格展示：512 Wh 磷酸铁锂电池、太阳能/DC 输入最高 200 W、AC 输入最高 600 W、AC 额定输出 600 W（升维驱动 1000 W）。面板已经接入 Companion 的只读 Mesh 遥测；电量和实时充放电功率三项齐全时显示 `LIVE`，否则显示 `WAITING` 并保留模拟值，不会把未知的 SIID/PIID 猜成电量或功率。配对的米家蓝牙温湿度计 T2（`miaomiaoce.sensor_ht.t2`）会作为电能仓的环境指标显示温度与相对湿度。

## Mesh 只读遥测

网关连接代码位于 `apps/web/src/gateway/`，不增加第三方依赖，使用浏览器原生 `fetch` 和 `WebSocket`，兼容 Android 8 WebView。流程为：

1. 在小爱控制中心「设置 → 只读遥测令牌」创建 `mesh:read` Token。令牌只显示一次，服务端只保存 SHA-256 摘要。
2. 将 [`.env.example`](./.env.example) 复制为 `.env.local`，填写 `VITE_LX04_GATEWAY_URL` 和 `VITE_LX04_MESH_READ_TOKEN`。地址和 Token 由 Vite 在启动/构建时注入，页面不再提供编辑框，也不会写入 `localStorage`。
3. 重启开发服务器或重新构建使环境变量生效。客户端先读取 `/api/v1/telemetry/snapshot`，再通过 `/api/auth/ws-ticket` 换取一次性 ticket，最后连接 `/ws/telemetry` 并声明 `lx04-json` 子协议。
4. 收到 `snapshot`、`property.changed`、`gateway.state` 三种版本化帧后，在本地合并设备状态；序号跳跃会触发一次快照恢复，网关离线会停止重连并显示离线状态。

Companion 在原始属性旁提供 `semantic` 投影，mahoo-solar 当前接受 `battery.percent`、`power.input_w`、`power.output_w`、`power.input_remaining_minutes`、`power.output_remaining_minutes`、`temperature.celsius` 和 `humidity.percent`。温湿度计同时兼容 MIoT 标准属性 `2.1`/`2.2` 与网关扩展属性 `2.1001`/`2.1002`，分别映射为摄氏温度和相对湿度。已实测确认的 CUKTECH 编码为：`2/3 & 0xFF` 是电量百分比，`2/2` 的 bits 16–27 是充电功率，`2/1` 的 bits 16–27 是放电功率；低 16 位作为设备剩余分钟数，`5999` 在界面显示为“超过 99h”。服务端仍会透传所有原始值、schema 来源和置信度，方便审计和后续修正。

客户端会规范化 URL-safe Base64 Token 的尾部填充，因此从控制台复制时即使遗漏最后的 `=` 也可连接 0.3.6；0.3.7 起 Companion 本身也接受有/无填充的等价表示。Vite 环境变量会被编译进前端 bundle，Token 不是部署后的秘密；请只在可信局域网提供该页面，并将 `.env.local` 加入本地忽略列表，勿提交到仓库。

刷入对应 Companion 后的验证方式：

```powershell
$env:LX04_MESH_READ_TOKEN = '<控制中心仅显示一次的 mesh:read Token>'
Set-Location 'D:\Resourses\LX04\PATECH_MOD_V5_解包\LX04_VoiceHook'
.\scripts\verify-mahoo-telemetry.ps1 -DeviceIp '10.0.0.235' -RequireCuktechValues
```

如果刚重启后快照还没有 CUKTECH 字段，先在米家打开一次电能仓页面或等待下一次电量/功率变化，再重新运行。前端环境变量需要在启动开发服务器或构建前准备好，修改后重启 Vite 才会生效。

全天曲线以同一个几何与天气模型每 30 分钟采样，并以梯形积分得到 kWh。缺失时段采用晴空回退并在曲线下提示。所有时间均显式采用 Asia/Shanghai，不受浏览器时区影响。

## 验证

`pnpm test` 覆盖北向楼栋关系与高度、射线相交、天气与遮挡功率联动、夜间归零、温度效应、天气解析与缺失数据、时区边界。浏览器验收可使用首页的四个视角、楼层/方位角、时间轴、天气选择和粒子开关；服务失败时可点击刷新重试。

## 页面隐私与导航

页面统一显示「我的小区」，移除真实小区、道路、楼栋编号、高度标签及经纬度文案；内部几何仍用于遮挡计算。太阳采用独立的天空示意球体，与窗户住户标记分离，太阳高度低于地平线时隐藏；视野外显示提示。指南针读取相机姿态，始终固定在视口内。日出、日落按北京时间分钟数定位到 24 小时时间轴，标签与滑块共用刻度宽度。
