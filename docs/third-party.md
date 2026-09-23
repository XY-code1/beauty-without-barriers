# 第三方组件

依赖版本以 `package-lock.json` 为准；业务规则、流程和页面为本项目新实现。

| 组件 | 用途 | 来源/许可证 |
|---|---|---|
| React | 页面与状态 | https://github.com/facebook/react · MIT |
| Vite | 开发和静态构建 | https://github.com/vitejs/vite · MIT |
| TypeScript | 类型检查 | https://github.com/microsoft/TypeScript · Apache-2.0 |
| MediaPipe Tasks Vision | Face Landmarker | https://github.com/google-ai-edge/mediapipe · Apache-2.0 |
| OpenCV.js / npm 分发 | 图像变换、连通域与直线拟合 | https://github.com/TechStark/opencv-js · Apache-2.0；该分发注明使用 OpenCV 4.12.0 官方构建 |
| Vitest | 单元/图像算法测试 | https://github.com/vitest-dev/vitest · MIT |
| Playwright | 页面与浏览器测试 | https://github.com/microsoft/playwright · Apache-2.0 |

Face Landmarker 模型下载地址：
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

模型说明与接口：https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js

模型和 WASM 经安装脚本获取，仓库不包含重新声明版权的模型副本。分发时需保留第三方许可证，核对模型供应方的适用条款；本项目没有训练或自称拥有模型。

本实现未复制 `otdnnc/virtual-makeup` 或其他调研项目的源码、图片、美妆素材。眼睛线条图标为项目内 SVG，不使用外部人像。
