# Solar Apartment 3D 光伏数字孪生网站设计与搭建文档

> 项目目标：构建一个面向个人公寓光伏系统的 3D 实时可视化网站。  
> 网站通过真实时间、地理位置、公寓朝向和光伏板姿态计算太阳位置、入射角与遮挡关系，并通过 LX04 小爱触屏音箱逆向后提供的 WebSocket 服务获取电能仓实时数据，展示当前光伏输入功率、电池状态和全天变化曲线。

---

## 1. 项目定位

本项目不是传统的“能源管理后台”，而是一个轻量级的个人光伏数字孪生系统。

它需要同时回答三类问题：

1. **太阳现在在哪里？**
   - 当前太阳高度角
   - 当前太阳方位角
   - 今天的太阳运行轨迹
   - 日出、日落时间

2. **太阳现在是怎样照到光伏板上的？**
   - 光伏板朝向
   - 光伏板倾角
   - 太阳光与光伏板法线的入射角
   - 直射区域比例
   - 是否被楼体、窗框、阳台等遮挡
   - 理论几何利用率

3. **实际上发了多少电？**
   - 电能仓实时充电功率
   - 当前输出功率
   - 电池电量
   - 充放电状态
   - 今日功率曲线
   - 今日累计光伏输入电量
   - 理论光照条件与实际功率之间的差异

最终网站应做到：

> “看到太阳在哪里、看到它怎样照进房间、看到光伏板实际被照到多少，同时看到这一刻真实产生了多少功率。”

---

# 2. 已知实际环境

## 2.1 地理位置

当前项目按以下环境设计：

- 城市：长沙
- 纬度、经度：由配置文件设置
- 时区：Asia/Shanghai
- 阳台/落地窗朝向：东偏南约 15°
- 按标准方位角定义：
  - 北：0°
  - 东：90°
  - 南：180°
  - 西：270°
- 因此窗户方位角约为：

```text
105°
```

## 2.2 光伏系统

当前系统：

- 光伏板：320 W
- 工作电压：约 18 V
- 室内落地窗后安装
- 光伏板大致与窗面平行
- 电能仓：酷态科 600
- 光伏输入：
  - 12–28 V
  - 最大 10 A
  - 最大约 200 W

## 2.3 主要负载

目前主要为：

- Mac mini M4
- 两块额外供电固态硬盘
- 电能仓本身自耗

已估算每日耗电约：

```text
157.28 Wh/day
```

24 小时等效平均功率约：

```text
6.55 W
```

---

# 3. 总体技术架构

建议采用前后端分离，但保持整体尽可能轻量。

```text
┌──────────────────────────────┐
│        320W 光伏板           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      酷态科电能仓 600        │
└──────────────┬───────────────┘
               │ BLE Mesh
               ▼
┌──────────────────────────────┐
│   小爱触屏音箱 LX04          │
│                              │
│  逆向 Mesh Gateway           │
│  实时属性读取 / 监听         │
└──────────────┬───────────────┘
               │
               │ WebSocket
               ▼
┌──────────────────────────────┐
│ Solar Gateway WebSocket      │
│ Server                       │
│                              │
│ - 实时功率                   │
│ - 电量                       │
│ - 充放电状态                 │
└──────────────┬───────────────┘
               │
               │ LAN / WebSocket
               ▼
┌────────────────────────────────────────┐
│      Solar Apartment Web Server        │
│                                        │
│ - WebSocket Client                     │
│ - 数据归一化                           │
│ - 历史采样                             │
│ - API                                  │
│ - WebSocket/SSE                        │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│              Web Frontend              │
│                                        │
│ React                                  │
│ Three.js / React Three Fiber           │
│ Sun Position Engine                    │
│ Energy Dashboard                       │
│ Time-series Chart                      │
└────────────────────────────────────────┘
```

---

# 4. 推荐技术栈

## 4.1 前端

推荐：

```text
React
TypeScript
Vite
Three.js
React Three Fiber
@react-three/drei
Zustand
ECharts
SunCalc
```

职责：

| 技术 | 用途 |
|---|---|
| React | 页面 UI |
| TypeScript | 类型系统 |
| Vite | 构建工具 |
| Three.js | 3D 渲染 |
| React Three Fiber | Three.js React 封装 |
| Drei | Camera、Controls、Loader 等 |
| Zustand | 全局状态 |
| ECharts | 功率历史曲线 |
| SunCalc | 太阳位置计算 |

---

## 4.2 后端

推荐第一版直接使用：

```text
Node.js
TypeScript
Fastify
WebSocket
SQLite
```

原因：

- 项目规模小
- 数据量非常低
- 与前端共用 TypeScript 类型
- WebSocket 支持简单
- SQLite 足够保存数年数据

如果以后希望降低常驻内存，可以替换为 Go。

---

# 5. Monorepo 项目结构

推荐使用 pnpm workspace。

```text
solar-apartment/
│
├── apps/
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── scenes/
│   │   │   ├── features/
│   │   │   ├── stores/
│   │   │   └── styles/
│   │   │
│   │   └── package.json
│   │
│   └── server/
│       ├── src/
│       │   ├── gateway/
│       │   ├── history/
│       │   ├── api/
│       │   ├── websocket/
│       │   └── index.ts
│       │
│       └── package.json
│
├── packages/
│   │
│   ├── solar/
│   │   ├── src/
│   │   │   ├── sun-position.ts
│   │   │   ├── vectors.ts
│   │   │   ├── panel.ts
│   │   │   ├── incidence.ts
│   │   │   └── solar-state.ts
│   │
│   ├── geometry/
│   │   ├── coordinates.ts
│   │   ├── occlusion.ts
│   │   └── sampling.ts
│   │
│   ├── protocol/
│   │   ├── gateway.ts
│   │   ├── energy.ts
│   │   └── websocket.ts
│   │
│   └── config/
│
├── models/
│   ├── apartment.glb
│   └── README.md
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

# 6. 坐标系规范

这个规范必须在项目最开始确定，否则后期很容易出现太阳方位错误。

Three.js 世界坐标统一定义：

```text
+X = East  东
+Y = Up    天空
+Z = North 北
```

因此：

```text
North = +Z
East  = +X
South = -Z
West  = -X
```

所有太阳、建筑、光伏板、罗盘、方位角都必须服从这个定义。

---

# 7. 太阳位置计算

输入参数：

```ts
interface LocationConfig {
  latitude: number
  longitude: number
  timezone: string
}
```

根据：

```text
当前时间
纬度
经度
```

获得：

```ts
interface SunPosition {
  altitude: number
  azimuth: number
}
```

单位统一使用：

```text
degree
```

内部进行三角函数计算时再转换为 radian。

---

# 8. 太阳方向向量

根据太阳：

```text
h = altitude
A = azimuth
```

建立方向：

```text
x = cos(h) × sin(A)
y = sin(h)
z = cos(h) × cos(A)
```

最终：

```ts
interface SunVector {
  x: number
  y: number
  z: number
}
```

该向量同时用于：

- 太阳模型位置
- DirectionalLight
- 阴影方向
- Raycast
- 入射角计算

必须保持单一数据源。

---

# 9. 光伏板模型

## 9.1 配置

```ts
interface PanelConfig {
  ratedPower: number
  azimuth: number
  tilt: number
  glassTransmission: number
}
```

当前可以设：

```ts
{
  ratedPower: 320,
  azimuth: 105,
  tilt: 90,
  glassTransmission: 0.8
}
```

注意：

`glassTransmission` 第一阶段只是经验配置值。

后期可以通过实际发电数据进行拟合。

---

# 10. 光伏板法向量

光伏板由：

```text
azimuth
tilt
```

决定一个法向量：

```ts
Vector3 panelNormal
```

然后和太阳方向向量计算夹角。

---

# 11. 太阳入射角

定义：

```text
N = 光伏板法向量
S = 太阳方向向量
```

则：

```text
θ = acos(N · S)
```

其中：

```text
θ = 0°
```

代表太阳垂直照射光伏板。

```text
θ = 90°
```

代表太阳光与板面平行。

---

# 12. 几何利用率

第一阶段采用简单余弦模型：

```text
geometricFactor = max(0, cos θ)
```

示例：

| 入射角 | 几何因子 |
|---:|---:|
| 0° | 1.00 |
| 30° | 0.87 |
| 45° | 0.71 |
| 60° | 0.50 |
| 75° | 0.26 |
| 90° | 0 |

它不能代表真实太阳辐照度。

因此 UI 中建议使用名称：

```text
几何利用率
Solar Geometry Factor
```

不要直接称为：

```text
理论发电功率
```

---

# 13. 建筑遮挡计算

3D 场景真正有价值的部分在于遮挡计算。

例如：

```text
太阳
  │
  │
  ▼
阳台上沿
████████
      │
      ▼
   光伏板
```

仅仅计算太阳角度并不能知道是否被楼体遮挡。

因此使用 Three.js：

```text
Raycaster
```

实现。

---

# 14. 单点遮挡检测

从光伏板中心点：

```text
Panel Center
```

向：

```text
Sun Direction
```

发射 Ray。

如果首先命中：

- 墙体
- 阳台
- 窗框
- 建筑
- 其他遮挡物

则：

```ts
directSunlight = false
```

否则：

```ts
directSunlight = true
```

---

# 15. 光伏板面积采样

为了得到更真实的遮挡比例，不只采样中心点。

推荐第一版：

```text
8 × 12 = 96
```

个采样点。

每个点向太阳方向发射 Ray。

例如：

```text
96 个采样点

82 个未被遮挡
```

得到：

```text
exposureRatio = 82 / 96
```

即：

```text
85.4%
```

UI 显示：

```text
直射面积
85%
```

---

# 16. 光伏板可视化

光伏板材质可按照采样结果动态变化。

例如：

```text
亮区域 = 有太阳直射
暗区域 = 被遮挡
```

第一版可以采用：

```text
整体平均亮度
```

后期再实现细分 Shader 或区域纹理。

---

# 17. 玻璃影响

因为光伏板安装在落地窗内部，玻璃是不可忽略的一层。

第一阶段使用：

```text
glassTransmission
```

例如：

```text
0.80
```

于是定义：

```text
solarPotential =
geometricFactor
× exposureRatio
× glassTransmission
```

例如：

```text
geometricFactor = 0.86
exposureRatio   = 0.82
glass            = 0.80
```

则：

```text
solarPotential ≈ 0.56
```

UI 可以显示：

```text
当前太阳几何潜力
56%
```

---

# 18. 太阳轨迹

除了当前太阳位置，还应该绘制：

```text
当天太阳轨迹
```

从：

```text
Sunrise
```

到：

```text
Sunset
```

每：

```text
5 / 10 分钟
```

计算一个太阳位置点。

形成：

```text
THREE.Line
```

例如：

```text
       ☀
     ╱   ╲
   ╱       ╲
 ╱           ╲
E             W
```

当前太阳在轨迹线上以明显标记展示。

---

# 19. 时间模式

页面需要支持两种状态。

## 19.1 Live Mode

```text
LIVE
```

使用真实时间。

例如：

```text
2026-09-09
15:38:21
```

每秒更新时间。

太阳位置可：

```text
每 10 秒
```

重新计算一次。

没必要每帧重新计算。

---

## 19.2 Simulation Mode

用户拖动时间轴：

```text
06:00 ─────────●────── 18:30
```

立即进入：

```text
SIMULATION
```

可以查看：

- 上午 8 点
- 中午 12 点
- 下午 4 点
- 夏至
- 冬至
- 任意日期

此模式只改变太阳模型。

真实电能仓数据显示仍应标识：

```text
LIVE DATA
```

防止混淆。

---

# 20. LX04 WebSocket 数据源设计

逆向 LX04 后，建议将逆向实现与主网站完全隔离。

LX04 侧只负责：

```text
BLE Mesh
↓
协议解析
↓
实时属性
↓
WebSocket
```

不要把 BLE / Xiaomi 私有协议写进网站。

---

# 21. Gateway WebSocket 协议

建议采用简单 JSON。

连接：

```text
ws://lx04.local:8765
```

或：

```text
ws://192.168.x.x:8765
```

---

# 22. 实时状态消息

建议统一：

```json
{
  "type": "energy.state",
  "timestamp": 1788940000000,
  "data": {
    "solarInputPower": 83.42,
    "outputPower": 16.18,
    "batteryLevel": 78,
    "charging": true
  }
}
```

---

# 23. 能源状态类型

统一领域模型：

```ts
export interface EnergyState {
  timestamp: number

  solarInputPower: number

  outputPower?: number

  batteryLevel?: number

  charging?: boolean

  batteryTemperature?: number
}
```

网站永远只使用：

```text
EnergyState
```

不要直接使用 Xiaomi Property ID。

---

# 24. 原始属性与标准属性转换

LX04 Gateway 内部可以负责：

```text
Xiaomi Raw Property
↓
Decode
↓
Normalize
↓
EnergyState
```

例如：

```text
0x300206A8
```

最终只输出：

```json
{
  "solarInputPower": 17.04
}
```

即使将来协议解析方式发生变化，也不会影响网站。

---

# 25. WebSocket 心跳

建议：

```json
{
  "type": "ping",
  "timestamp": 1788940000000
}
```

服务器回应：

```json
{
  "type": "pong",
  "timestamp": 1788940000001
}
```

间隔：

```text
10 秒
```

超时：

```text
30 秒
```

---

# 26. 重连策略

网站后端连接 LX04：

```text
1 s
2 s
5 s
10 s
30 s
```

指数退避。

最高：

```text
30 s
```

连接恢复后：

```text
重新获取最新状态
```

---

# 27. 不建议浏览器直接连接 LX04

不推荐：

```text
Browser
↓
LX04
```

推荐：

```text
LX04
↓
Solar Server
↓
Browser
```

原因：

- LX04 地址不暴露给浏览器
- 可以存历史
- 可以做鉴权
- 可以缓存最新值
- 可以同时服务多个客户端
- 后期更容易增加 MQTT / HA 等数据源

---

# 28. Solar Server

服务器承担：

```text
Gateway Client
History Store
REST API
Realtime WebSocket
```

例如：

```text
LX04
↓
ws://lx04:8765
↓
Solar Server
↓
ws://solar-server/ws
↓
Browser
```

---

# 29. 历史数据存储

第一版推荐：

```text
SQLite
```

表：

```sql
CREATE TABLE energy_samples (
  timestamp INTEGER PRIMARY KEY,
  solar_input_power REAL NOT NULL,
  output_power REAL,
  battery_level REAL
);
```

---

# 30. 数据采样策略

如果 LX04 每秒推送数据：

不建议所有数据永久保存。

建议：

实时：

```text
1 秒
```

展示。

历史：

```text
10 秒
```

或：

```text
30 秒
```

保存。

每天：

```text
8640 条（10 秒）
```

数据量仍然很低。

---

# 31. 分层历史数据

后期可以增加：

```text
Raw:
10 秒

Daily:
1 分钟平均

Long-term:
5 分钟平均
```

例如保留：

```text
最近 7 天：10 秒
最近 90 天：1 分钟
长期：5 分钟
```

第一版不需要提前实现复杂分层。

---

# 32. REST API

## 当前状态

```http
GET /api/energy/current
```

响应：

```json
{
  "timestamp": 1788940000000,
  "solarInputPower": 84.2,
  "outputPower": 16.3,
  "batteryLevel": 81
}
```

---

# 33. 今日历史

```http
GET /api/energy/history?date=2026-09-09
```

响应：

```json
[
  {
    "timestamp": 1788900000000,
    "solarInputPower": 0
  },
  {
    "timestamp": 1788900060000,
    "solarInputPower": 1.2
  }
]
```

---

# 34. 今日汇总

```http
GET /api/energy/summary/today
```

响应：

```json
{
  "solarEnergyWh": 482.4,
  "consumptionWh": 158.1,
  "maxSolarPower": 176.3,
  "peakTime": "11:24",
  "averageSolarPower": 34.7
}
```

---

# 35. 前端实时 WebSocket

Solar Server 向 Browser：

```json
{
  "type": "energy.update",
  "timestamp": 1788940000000,
  "data": {
    "solarInputPower": 84.2,
    "batteryLevel": 81
  }
}
```

---

# 36. 前端状态设计

建议 Zustand。

```ts
interface EnergyStore {
  state?: EnergyState

  connected: boolean

  update: (state: EnergyState) => void
}
```

---

# 37. 页面视觉结构

本项目不建议采用传统：

```text
左侧导航
顶部栏
大量卡片
```

页面应该以：

```text
3D 场景
```

为主体。

推荐：

```text
┌──────────────────────────────────────────────┐
│ Solar Apartment                    ● LIVE   │
│ Changsha · 2026-09-09 15:42                 │
│                                              │
│                                              │
│                 ☀                            │
│                  ╲                           │
│                   ╲                          │
│                    ╲                         │
│                                              │
│            ┌─────────────────┐               │
│            │                 │               │
│            │   Apartment     │               │
│            │          ▰ PV   │               │
│            │                 │               │
│            └─────────────────┘               │
│                                              │
│                                              │
│  Solar       Incidence       Battery         │
│  84.2 W       31.7°            81%           │
│                                              │
│ ───────────────────────────────────────────  │
│ TODAY POWER                                  │
│                                              │
│      ╭────────────╮                          │
│ ─────╯            ╰────────                  │
│                                              │
│ 06   08   10   12   14   16   18            │
│                                              │
│ LIVE ───────────────●──────────────          │
└──────────────────────────────────────────────┘
```

---

# 38. 3D 场景信息层级

## 第一层：世界

展示：

- 天空
- 地面
- 公寓楼

## 第二层：房间

展示：

- 当前楼层
- 房间
- 落地窗

## 第三层：能源

展示：

- 光伏板
- 太阳
- 太阳光线
- 阴影
- 光伏板照射区域

## 第四层：数据

显示：

```text
太阳高度角
太阳方位角
入射角
直射面积
实时功率
电池状态
```

---

# 39. Camera 设计

推荐提供三种相机预设。

## Overview

```text
公寓整体
```

## Room

```text
看向房间和落地窗
```

## Solar Panel

```text
聚焦光伏板
```

用户仍可使用 OrbitControls 自由旋转。

---

# 40. 实时功率 UI

实时功率建议成为最醒目的数字：

```text
SOLAR INPUT

84.2 W
```

同时显示：

```text
+12.3 W / 1 min
```

可选。

不要做大型仪表盘 Gauge。

数字本身更直接。

---

# 41. 太阳状态 UI

建议：

```text
SUN

Altitude
42.6°

Azimuth
137.2°
```

---

# 42. 光伏状态 UI

```text
PANEL

Incidence
31.7°

Exposure
82%

Geometry
70%
```

---

# 43. 今日功率曲线

横轴：

```text
06:00 → 18:00
```

纵轴：

```text
W
```

主曲线：

```text
真实光伏输入功率
```

以后再增加：

```text
理论几何潜力
```

---

# 44. 理论曲线与实际曲线

后期这是最有价值的可视化之一。

例如：

```text
理论条件
━━━━━━

真实发电
──────
```

可以帮助识别：

- 云
- 雾霾
- 建筑遮挡
- 玻璃损耗
- MPPT 限功率
- 高温衰减

---

# 45. 今日累计光伏能量

由功率积分得到：

```text
E ≈ Σ(P × Δt)
```

例如：

```text
482 Wh
```

UI：

```text
TODAY

Solar
482 Wh

Consumption
157 Wh

Balance
+325 Wh
```

---

# 46. 电能平衡

目前已知每日预计负载：

```text
157.28 Wh
```

可以作为配置：

```ts
dailyExpectedConsumptionWh: 157.28
```

页面展示：

```text
今日光伏发电
482 Wh

今日预计消耗
157 Wh

覆盖率
307%
```

后期如果能从电能仓拿到真实输出功率，则改用真实积分。

---

# 47. 当前发电效率指标

建议增加一个自定义指标：

```text
Solar Capture
```

其目标不是表示光伏板物理效率，而是：

```text
实际功率
÷
当前条件下预计可获得功率
```

第一版不要急着显示。

需要积累足够历史数据后再做。

---

# 48. 配置文件

例如：

```ts
export const config = {
  location: {
    latitude: 28.xxxx,
    longitude: 112.xxxx,
    timezone: 'Asia/Shanghai',
  },

  apartment: {
    azimuth: 105,
  },

  panel: {
    ratedPower: 320,
    azimuth: 105,
    tilt: 90,
    glassTransmission: 0.8,
  },

  powerStation: {
    maxSolarInputPower: 200,
    maxSolarInputVoltage: 28,
    maxSolarInputCurrent: 10,
  },

  consumption: {
    expectedDailyWh: 157.28,
  },
}
```

真实经纬度建议放：

```text
.env
```

避免公开仓库直接暴露精确住址。

---

# 49. 公寓 3D 模型

建议使用 Blender 建模。

最终导出：

```text
GLB
```

第一版不需要：

- 家具
- 装饰
- 材质细节
- 高精度贴图

只需要确保：

```text
几何尺寸
窗户位置
阳台
墙体
光伏板
```

准确。

因为这些会影响太阳遮挡计算。

---

# 50. 模型尺寸

推荐直接使用：

```text
1 Three.js Unit = 1 meter
```

例如：

```text
房间高 2.8
窗宽 3.2
窗高 2.4
```

这样所有光照和空间逻辑更容易理解。

---

# 51. 公寓模型分层

Blender 对象建议命名：

```text
Building
Apartment
Floor
Wall
Window
WindowFrame
Balcony
SolarPanel
```

其中可以参与遮挡的 Mesh：

```text
Wall
WindowFrame
Balcony
Building
```

建立：

```text
occluderGroup
```

Raycast 只检查这一组。

---

# 52. 性能策略

目标：

```text
桌面浏览器 60 FPS
```

原则：

- 太阳位置不需要每帧计算
- Raycast 不需要每帧运行
- 遮挡计算可以每 5–10 秒
- 建筑模型使用简化几何
- 阴影控制分辨率
- 不使用大量动态光源

---

# 53. 推荐更新频率

| 数据 | 更新频率 |
|---|---:|
| 当前时间 | 1 s |
| 实时功率 | WebSocket Push |
| 太阳位置 | 10 s |
| 太阳轨迹 | 每天一次 |
| 遮挡计算 | 5–10 s |
| 电池状态 | WebSocket Push |
| 历史图 | 10–30 s |

---

# 54. WebSocket 断线状态

页面必须明显显示：

```text
● LIVE
```

或：

```text
○ OFFLINE
```

如果 Gateway 失联：

```text
Real-time data unavailable
Last update 15:42:18
```

不要继续把旧值伪装成实时值。

---

# 55. 数据可信度

实时数据建议带：

```ts
interface TelemetryMeta {
  source: 'lx04'
  receivedAt: number
  deviceTimestamp?: number
}
```

这样以后可以知道：

```text
设备产生数据的时间
```

和：

```text
服务器收到数据的时间
```

之间的延迟。

---

# 56. 安全

LX04 WebSocket 服务原则上：

```text
只允许局域网访问
```

至少支持一个：

```text
token
```

例如：

```text
Authorization: Bearer xxx
```

不要直接暴露公网。

如果网站需要公网访问：

```text
Internet
↓
Reverse Proxy
↓
Solar Server
↓
LAN
↓
LX04
```

而不是：

```text
Internet
↓
LX04
```

---

# 57. 推荐部署

由于已有长期运行的 Mac mini，可以：

```text
Mac mini
│
├── Solar Server
├── SQLite
└── Web Frontend
```

LX04 仅负责：

```text
BLE Mesh Gateway
+
WebSocket Agent
```

---

# 58. Docker

第一版可以部署为：

```text
docker compose
```

例如：

```text
solar-web
solar-server
```

数据库：

```text
SQLite volume
```

无需单独数据库容器。

---

# 59. 开发阶段规划

## Phase 1：太阳计算

完成：

- 当前时间
- 经纬度
- Sun Position
- altitude
- azimuth
- sun vector

验收：

```text
网站可以正确显示长沙当前太阳高度和方向
```

---

# 60. Phase 2：基础 3D

完成：

- Three.js 场景
- Camera
- OrbitControls
- 天空
- 简化公寓模型
- 光伏板
- 太阳

验收：

```text
太阳在正确方向移动
```

---

# 61. Phase 3：光伏几何

完成：

- Panel Normal
- Incidence Angle
- geometricFactor

验收：

```text
页面实时显示入射角
```

---

# 62. Phase 4：建筑遮挡

完成：

- Raycaster
- occluderGroup
- 96 点采样
- exposureRatio

验收：

```text
太阳被阳台遮挡时，
光伏板照射面积会明显下降
```

---

# 63. Phase 5：LX04 WebSocket

此阶段在 LX04 逆向工作完成后开始。

完成：

```text
LX04
↓
WebSocket
↓
Solar Server
```

验收：

```text
服务器可以实时获得电能仓功率
```

理想刷新：

```text
1–10 秒
```

---

# 64. Phase 6：实时功率

完成：

- EnergyState
- WebSocket Client
- Server Realtime API
- 前端实时数字

验收：

```text
电能仓功率变化后，
网页几秒内变化
```

---

# 65. Phase 7：历史数据

完成：

- SQLite
- Sampling
- History API
- 今日曲线
- 今日 Wh 积分

验收：

```text
可以查看完整一天发电变化
```

---

# 66. Phase 8：时间旅行

完成：

```text
Live
Simulation
Timeline
Date Picker
```

验收：

可以查看：

```text
今天 08:00
今天 12:00
今天 16:00
冬至
夏至
```

对应的太阳和阴影。

---

# 67. Phase 9：理论 vs 实际

完成：

```text
Solar Geometry
Exposure
Actual Power
```

建立关联。

例如：

```text
10:32

Geometry      82%
Exposure      94%
Actual        126 W
```

---

# 68. 第一版 MVP 范围

建议 MVP 只做：

### 3D

- 公寓简化模型
- 窗户
- 光伏板
- 太阳
- 太阳轨迹

### Solar

- 当前太阳高度
- 当前太阳方位
- 入射角
- 几何因子

### Telemetry

- LX04 WebSocket
- 光伏输入功率
- 电池电量

### History

- 今日功率曲线
- 今日累计 Wh

暂时不要做：

- 天气预测
- AI
- 自动优化
- 多设备
- 多光伏板
- 多用户
- 复杂权限系统

---

# 69. 第二阶段功能

MVP 稳定后再增加：

- 天气
- 云量
- 实际太阳辐照度
- 发电预测
- 玻璃透过率拟合
- 今日预计发电量
- 月统计
- 年统计
- 光伏覆盖率
- 市电替代量

---

# 70. 第三阶段：模型校准

积累历史数据：

```text
Sun Position
Panel Geometry
Exposure
Actual Power
```

之后可以拟合：

```text
玻璃损耗
面板效率
温度损耗
系统损耗
```

使网站逐渐从：

```text
几何可视化
```

进化成：

```text
真实光伏系统数字模型
```

---

# 71. 长期可计算指标

以后可以计算：

## Solar Coverage

```text
光伏提供电量
÷
负载耗电
```

## Solar Capture

```text
实际捕获太阳能
÷
理论可利用太阳能
```

## Self Sufficiency

```text
由太阳能提供的用电量
÷
总用电量
```

## Daily Balance

```text
今日发电 Wh
-
今日耗电 Wh
```

---

# 72. 最终产品形态

最终网站应该呈现为：

```text
一个真实运行中的公寓能源模型
```

而不是：

```text
一个有 3D 背景的 Dashboard
```

理想状态下用户打开页面后，第一眼看到的是：

```text
太阳
↓
公寓
↓
窗户
↓
光伏板
```

并立刻知道：

```text
太阳在哪里
↓
是否被遮挡
↓
以什么角度照射
↓
当前到底发多少瓦
```

这是整个项目最核心的体验。

---

# 73. 核心设计原则

整个项目建议始终遵循以下原则：

### 1. 物理状态是主角

不是 UI 卡片。

### 2. 3D 场景必须参与计算

不是纯装饰。

### 3. 实时数据与设备协议解耦

网站只认：

```text
EnergyState
```

### 4. LX04 只做 Gateway

不要承担业务逻辑。

### 5. Solar Server 做数据中枢

负责：

```text
实时
历史
API
缓存
```

### 6. 所有模拟值与真实值明确区分

例如：

```text
Geometry
Estimated
Actual
```

不得混为一谈。

### 7. 先做可验证模型，再做复杂预测

先确认：

```text
太阳位置
方向
遮挡
功率
```

都是正确的。

然后再逐步加入天气和预测模型。

---

# 74. 推荐下一步

目前最合适的编码顺序：

```text
1. 初始化 Monorepo

2. 创建 packages/solar

3. 完成：
   sunPosition()
   sunVector()
   panelNormal()
   incidenceAngle()

4. 建立第一个 Three.js Scene

5. 放入：
   地面
   简化楼体
   光伏板
   太阳

6. 实现 LIVE 时间

7. 实现太阳轨迹

8. 实现 Raycast 遮挡

9. 等 LX04 WebSocket 完成

10. 接入真实 EnergyState

11. 保存 SQLite 历史

12. 完成今日功率曲线
```

这样可以保证：

即使 LX04 逆向尚未完全结束，3D 网站部分也可以独立向前开发。

等 WebSocket 数据源完成后，只需要接入标准化：

```text
EnergyState
```

即可完成真实数据融合。
