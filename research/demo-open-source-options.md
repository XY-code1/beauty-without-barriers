# 单侧眼线辅助 Demo：开源选择与自建难度

调研日期：2026-09-23。

范围：帮助美妆新手的单侧眼线辅助，先评估可以展示的最小 Demo。本轮只阅读官方文档、仓库和相关源码；未安装依赖、运行这些项目或进行手机效果测试。本文中的难度和选型建议是工程判断，不是已验证的性能结论。

## 结论

- 不采用现成换妆应用、保留 MediaPipe 等基础模型，自己实现页面、参考线和步骤控制，是可行且范围可控的方案。
- 如果连现成关键点模型都不用，需要自己准备数据、训练与部署模型，工作性质就从应用开发变成算法研发，不适合作为当前 Demo 的起点。
- 新找到的 OpenMakeupSDK 是最直接的眼线预览候选；它已经实现眼线图案与眼周表面贴合。但它没有替团队验证教学效果，也不等于真实眼线识别与纠错。
- 先把产品流程限定为“预览参考 → 用户操作 → 移开手后重新观察 → 手动进入下一步”，可以让第一版不依赖持续且精确的遮挡理解。该流程仍需要用户可用性验证。

## OpenMakeupSDK：直接相关的眼线预览参考

仓库：[ehsanwwe/OpenMakeupSDK](https://github.com/ehsanwwe/OpenMakeupSDK)。

调研期间远端 HEAD 解析为 `12c5a8023aab0fcec7eef4fbdc0d1a29cf9989dd`；正式试跑应固定版本。下文链接为便于阅读的主分支入口，后续内容可能更新。

已核实的源码能力：

- [分类定义](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/src/categories.js)存在 `eyeline`，并把 `eyeliner` 作为别名；默认黑色，不支持材质 finish 参数。
- [公共接口](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/src/OpenMakeup.js)提供初始化、应用/清除某类妆容、查询图案和资源释放。
- [眼周几何](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/src/core/FaceNurbsModelController.js)将左右眼周的 MediaPipe 关键点作为 NURBS 曲面控制点，生成并更新网格；这提供了比固定屏幕贴图更贴近眼部运动的映射实现。
- [引擎](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/src/core/MakeupEngine.js)逐帧接收 MediaPipe FaceMesh 结果，更新左右眼线曲面；[材质代码](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/src/core/materials.js)加载眼线纹理和 shader。
- 浏览器端 JavaScript ES modules、Three.js/WebGL、MediaPipe；提供 TypeScript 类型。[package.json](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/package.json)
- 仓库有实际 [MIT LICENSE](https://github.com/ehsanwwe/OpenMakeupSDK/blob/main/LICENSE)。第三方运行时和资产来源仍应分别保留其声明，根许可证不替代依赖许可核对。

适合参考：目标妆效预览、眼线图案选择、眼周纹理映射、绘制层管理。

限制与接入成本：

- 使用旧 `@mediapipe/face_mesh` 与 `camera_utils` 全局脚本接口，不是当前 `@mediapipe/tasks-vision` Face Landmarker。引擎注释也明确说明采用全局脚本的原因。接入新项目需固定版本或编写适配，不宜混用两套跟踪器。
- 本次读取的 package 版本为 0.1.0，build 脚本是占位实现；没有据此验证可发布构建或兼容性。README 自述适合桌面/Android Chrome，不能代替真实 iPhone/Safari 测试。
- 当前公开接口按妆容类别控制，左右眼线默认一同开启；单侧教学需要增加侧别控制或改造渲染层。
- 所读渲染逻辑依据有无人脸关键点更新，没有看到直接的眼部手/笔遮挡标签。眼周曲面绘制不是遮挡识别。
- 这些代码生成虚拟眼线，没有输出真实眼线的像素掩膜、完成度或纠错判断。

建议：把它作为眼线预览的首选试验对象；如果首版只画参考曲线，Canvas 2D 更简单，不必同时承担完整 Three.js/材质/变形系统。

## Jayanths9/Virtual_Makeup：Python 算法学习参考

仓库：[Jayanths9/Virtual_Makeup](https://github.com/Jayanths9/Virtual_Makeup)。

- README 包含图片/摄像头换妆以及桌面应用，栈为 Python、MediaPipe、OpenCV，当前桌面说明还含 PySide6。
- [utils.py](https://github.com/Jayanths9/Virtual_Makeup/blob/main/utils.py)可核对眼线与眼影相关关键点选择、区域填充等思路；这类代码绘制的是虚拟颜色，不能作为实际妆容分割模型。
- 不直接匹配手机网页交付，迁移需要重做摄像头与界面集成。
- 本次公开仓库文件列表没有看到 LICENSE，未确认复用许可。适合阅读算法思路，暂不列为直接复制代码的首选。
- 搜索缓存与当前 README 出现版本差异，实际接入需固定提交重新核对环境；未依据旧缓存声称已验证最新程序行为。

## 官方基础能力：自建小应用的起点

MediaPipe 官方 [Face Landmarker Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)提供 JavaScript 示例与 `@mediapipe/tasks-vision` 接口。它输出人脸关键点，可选表情系数和变换矩阵；单人脸配置会应用平滑。检测调用同步阻塞调用线程，是否需要 Worker 和降低检测频率，要以目标设备实测决定。

浏览器摄像头通过 [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)获取，需要用户授权和安全上下文；手机通过局域网 HTTP 访问电脑开发服务器不能被默认当成可用的摄像头测试环境，应使用合适的 HTTPS 测试入口。

基础方案：React + TypeScript + Vite + MediaPipe Tasks Vision + Canvas 2D。无需为了展示参考线就先引入后端、数据库、LLM 或 OpenCV.js。若实际需求进入图像分割、图像质量分析或复杂合成，再按功能增加组件。

## 工作拆解与难度判断

| 工作 | 使用现成模型时的难度 | 主要工作 |
| --- | --- | --- |
| 摄像头、按钮、步骤界面 | 低到中 | 权限、生命周期、移动端布局 |
| 眼部关键点叠加 | 低到中 | 模型加载、坐标转换、视频镜像一致性 |
| 单侧参数化参考曲线 | 中 | 起终点与控制点规则、单侧控制、不同眼形适配 |
| 稳定展示 | 中 | 抖动与延迟取舍、丢失时隐藏、恢复、帧耗时 |
| 手/笔遮挡期间可靠指导 | 中高到高 | 自定义判断、误判测试、画面质量与状态控制 |
| 真实眼线识别与自动纠错 | 高，效果未知 | 样本、像素标注、评价标准、不同光线/眼形的验证 |
| 自研人脸关键点模型 | 很高 | 训练数据、模型训练、泛化评估、端侧部署 |

上述为工程估计，并非计时结果。若一名开发者熟悉前端和摄像头 API，最小参考线与步骤 Demo 可以先按数个人日做计划；这不包括通用遮挡识别、自动纠错、多机型适配或真实用户效果验证。团队技能与测试设备未知，不能据此作交付承诺。

## 推荐的首版范围

1. 固定一种自然眼线样式、一侧眼睛、正脸和良好光照。
2. 显示参考曲线、起点和方向，用户可以调整参考线长度/角度。
3. 分为预览与操作状态；操作时降低或隐藏精确定位提示，提供短文字/语音步骤。
4. 用户移开手后重新定位，通过按钮继续下一步；不把手动确认包装成模型自动判断完成。
5. 提供虚拟参考开关与原始画面对比；任何后续效果分析都读取未合成的原始帧。
6. 检测丢失/画面不可靠时隐藏线条，不保留可能过期的精确位置。手部检测只是后续补充线索。

第一项技术验证：在目标手机上完成摄像头 → 眼部定位 → 单侧参考曲线，并观察静止抖动、头动跟随、丢失后的隐藏和恢复。随后再验证新手是否能理解并使用这条参考线。

## 补充候选调研

当前补充核实结果：

- [MindAR](https://github.com/hiukim/mind-ar-js)：封装脸部 anchor、动态 face mesh、相机与 Three.js/A-Frame 接线。适合需要更完整 AR 覆盖时采用；官方 try-on 示例是眼镜/帽子/耳环，眼线图形仍需自己制作。它的 occluder 是虚拟头部深度遮挡，不是现实手遮眼判断。
- [TensorFlow.js face-landmarks-detection](https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection)：有左右眼等轮廓索引和统一关键点接口，是定位层的替代方案；当前直接使用 MediaPipe 即可，没有必要同时接入两套跟踪运行时。
- [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter)：有实际脸部纹理覆盖示例，核心检测状态主要是脸部位置/姿态，没有眼部轮廓点；可借鉴绘制思路，单侧眼线精确贴合的优先级低于 MediaPipe/MindAR。
- [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)：有官方浏览器实现，输出手部关键点；适合后续加入“手可能挡住眼区”的粗判断，不是眼部遮挡标签或笔尖检测器。
- [yakhyo/face-parsing](https://github.com/yakhyo/face-parsing)：提供 PyTorch/ONNX 的 19 类面部分割，能获得眼部等区域，但没有 eyeliner 类别；尚无官方浏览器实时路径，不建议第一版引入。
- [zllrunning/face-parsing.PyTorch](https://github.com/zllrunning/face-parsing.PyTorch)：同类研究参考，现有脚本偏 PyTorch/CUDA，不能直接变成手机网页组件；同样没有真实眼线类别。
- 面部分割仓库的代码许可、权重来源、训练数据协议需分别核对；代码 MIT 不能被写成所有附属材料都已确认可任意使用，也不能仅凭训练数据协议推断每份权重的全部法律条件。

浏览器跟踪和 AR 候选见 [browser-makeup-projects.md](./browser-makeup-projects.md)。

手部与面部分割候选见 [occlusion-segmentation-projects.md](./occlusion-segmentation-projects.md)。这些文档同样属于源码/文档调研，不代表项目已运行通过。
