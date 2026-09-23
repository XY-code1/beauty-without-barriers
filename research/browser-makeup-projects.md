# 浏览器端眼线 / 虚拟美妆项目调研

核查日期：2026-09-23（Asia/Shanghai）

## 范围和结论边界

本轮只核对新增候选 `jeeliz/jeelizFaceFilter`、`hiukim/mind-ar-js` 和 `tensorflow/tfjs-models/face-landmarks-detection` 的官方仓库、官方文档和源码；没有安装或运行它们，也没有把已有的 MediaPipe 和 `otdnnc/virtual-makeup` 重复当作新发现。以下把“跟踪并覆盖绘制”和“识别眼线并教学”分开。三者都不是开箱即用的眼线识别/教学系统。

已知的 `ehsanwwe/OpenMakeupSDK` 作为另一条路线由主线单独核对；本文件只说明新增候选能省什么工作以及它们的边界。

对于本题“新手单侧眼线辅助 demo”，应先决定展示目标：

- 只需让一条预设眼线随人脸实时贴合：优先能直接提供脸部网格或眼部关键点的基础库，再自己做 Canvas/WebGL/Three.js 绘制。
- 需要判断“是否画到位”、给方向/起止点/遮挡反馈：任何候选都只提供定位基础，不能替代样本、判定标准、时序状态和用户验证。

## 先看选型

| 候选 | 能复用的部分 | 官方现成妆效证据 | 对单侧眼线的直接性 | 主要结论 |
| --- | --- | --- | --- | --- |
| [MindAR](https://github.com/hiukim/mind-ar-js) | 摄像头启动、WebGL/Three.js 或 A-Frame 场景、脸部 anchor、动态 face mesh、blendshapes、镜像和基础滤波 | [Face Tracking Virtual Try-On](https://hiukim.github.io/mind-ar-js-doc/face-tracking-examples/tryon) 是眼镜/帽子/耳环；[ThreeJS FaceMesh](https://hiukim.github.io/mind-ar-js-doc/more-examples/threejs-face-facemesh) 是通用纹理网格 | 中：能把纹理/网格贴上脸，眼线区域仍需自己画或做纹理/着色器 | 仅做实时覆盖时，三者中最省场景与贴合代码；没有眼线识别 |
| [TFJS face-landmarks-detection](https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection) | `estimateFaces`、468/478 点、左右眼/眉/嘴轮廓、虹膜细化、可选 TFJS 或 MediaPipe runtime、可自定义模型 URL | 官方 demo 是 FaceMesh 关键点；README 没有虚拟化妆模块 | 高：直接拿眼轮廓点，适合自己绘制和做闭眼/姿态规则 | 做“眼线覆盖 + 教学规则”最可控，但要自己承担渲染、平滑、评估和移动端调优 |
| [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter) | WebRTC 摄像头、WebGL 人脸检测/跟踪、Three.js/Canvas/CSS3D helper、现成 face-filter 样例和网格纹理覆盖 | [football_makeup/main.js](https://github.com/jeeliz/jeelizFaceFilter/blob/master/demos/threejs/football_makeup/main.js) 用 `face.json`、`texture.png`、`alpha_map_256.png` 做透明脸部绘制 | 低到中：已有全脸覆盖骨架，但核心回调没有眼轮廓点 | 可快速做“贴一层妆效”的概念演示；要精准单眼线仍需额外眼部几何或换 TFJS/MindAR |

因此有两种排序：

1. **现成 eyeline 预览**：已知的 OpenMakeupSDK 优先；新候选中 MindAR > Jeeliz > TFJS（MindAR/Jeeliz 省相机与 AR 场景接线）。
2. **眼线位置反馈或教学**：TFJS 关键点 > MindAR face mesh > Jeeliz。MindAR 的 mesh 能做覆盖，但其官方示例没有眼线类别；Jeeliz 的核心状态没有眼部轮廓。

上述是这三个新增候选之间的比较。当前项目已经考虑直接使用 MediaPipe Tasks Vision，因此 TFJS 包主要是替代方案或轮廓索引参考，没有必要为了同一套人脸定位再引入一层运行时。

## 1. Jeeliz FaceFilter

### 可复用模块与“是不是眼线”

[README](https://github.com/jeeliz/jeelizFaceFilter/blob/master/README.md) 把它定义为纯 JavaScript/WebGL 的实时人脸检测和跟踪库，输出保持框架无关：检测状态、脸部位置/尺度和旋转角，可接 Three.js、Babylon.js、A-Frame、Canvas2D 或 CSS3D。仓库 `demos/`、`helpers/`、`dist/` 和 `neuralNets/` 可作为静态网页起点；`dist/jeelizFaceFilter.module.js` 也可作为模块使用。

仓库确实有妆效性质的样例，但不是眼线识别。`[football_makeup/main.js](https://github.com/jeeliz/jeelizFaceFilter/blob/master/demos/threejs/football_makeup/main.js)` 的实现是：加载 `models/football_makeup/face.json`，用 Three.js `MeshBasicMaterial` 加载 `texture.png` 与 `alpha_map_256.png`，设为透明并以 `opacity: 0.6` 叠到脸部网格上；随后由 `JeelizThreeHelper.render` 把网格跟着人脸渲染。它是预先设计好的脸部绘制覆盖（足球涂装），不是从摄像头识别用户是否已经画了眼线。

更关键的边界在 [README 的 detection state](https://github.com/jeeliz/jeelizFaceFilter/blob/master/README.md#the-detection-state)：回调字段是 `detected`、`x/y`、`s`、`rx/ry/rz` 和 `expressions`；默认表达式只说明张嘴系数。没有左右眼轮廓、虹膜或面部语义分割输出。因此仅换一张眼线纹理并不能得到眼线位置检测或质量判定。

### 技术栈、浏览器和手机约束

- WebGL 负责推理和渲染，支持与 Three.js 等引擎拼接；README 说明其目标是移动端友好，并支持多脸（`maxFacesDetected` 最大 8），但多脸会分摊计算能力。
- 摄像头走 WebRTC/MediaStream；官方要求通过 HTTPS 提供页面，普通不安全 HTTP 不可用。README 还给出前置/后置摄像头、分辨率、旋转和镜像参数。
- 兼容性要求：有 WebGL2 时可用；没有 WebGL2 时，WebGL1 需要 `OES_TEXTURE_FLOAT` 或 `OES_TEXTURE_HALF_FLOAT` 扩展，否则返回 `GL_INCOMPATIBLE`。这比“所有手机浏览器都能跑”更严格。
- iOS WebView 在 iOS 14.2 及更早版本不能直接取得摄像头，仓库建议使用完整 Web 环境；其 Cordova 示例的 WebSocket hack 被 README 明确描述为有瓶颈，不应作为新手 demo 的默认路径。

### 代码、模型和素材的许可证边界

[仓库 LICENSE](https://github.com/jeeliz/jeelizFaceFilter/blob/master/LICENSE) 和 README 的 License 段落是 Apache 2.0，并说明应用可用于商业和非商业用途。README 说明仓库内 demo 以 FaceFilter license 发布，但没有为 `neuralNets/NN_*.json`、football makeup 的贴图/网格、随 demo 打包的 Three.js 等第三方素材给出一份逐项模型/素材许可清单。可把 Apache 2.0 作为代码仓库的起点，不应把它自动扩展为所有模型和第三方资产的独立授权；提交或公开 demo 前需逐项保留许可证和归属信息。

### 实际建议

如果已有一张设计好的“单侧眼线”透明纹理，只想演示随脸移动，Jeeliz 可以复用现成的 face mesh + alpha map 路线；如果需要按眼睛开合、眼尾方向和实际轮廓贴合，它的输出层级不够，应在其上另加眼部关键点来源，或直接使用 TFJS/MindAR。

## 2. MindAR

### 可复用模块与“是不是眼线”

[官方 README](https://github.com/hiukim/mind-ar-js/blob/master/README.md) 将 MindAR 定义为纯 JavaScript 的 Web AR 库，支持 image tracking 和 face tracking，使用 WebGL 与 Web Worker，并有 A-Frame 和 Three.js 集成。当前包的 [package.json](https://github.com/hiukim/mind-ar-js/blob/master/package.json) 显示 `mind-ar` 1.2.5，依赖 `@mediapipe/tasks-vision`、TensorFlow.js 等，Three.js 是 peer dependency。

最直接的可复用入口：

- [Face Tracking Quick Start](https://hiukim.github.io/mind-ar-js-doc/face-tracking-quick-start/webpage) 用 `mindar-face` 和 `mindar-face-target="anchorIndex: ..."` 把对象锚到脸部点；可用 anchor index 跟随鼻尖或其他位置。具体索引应按实际采用的包与模型版本核对。
- [Three.js Face source](https://github.com/hiukim/mind-ar-js/blob/master/src/face-target/three.js) 提供 `MindARThree.addAnchor(landmarkIndex)`、`addCSSAnchor`、`addFaceMesh` 和 `getLatestEstimate`；源码中 `addFaceMesh()` 创建会随脸变形的动态 face geometry，`controller.js` 用 One Euro filter 平滑关键点、脸矩阵和尺度。
- [Face mesh 示例](https://github.com/hiukim/mind-ar-js/blob/master/examples/face-tracking/three-facemesh.html) 直接给 face mesh 加 UV 纹理；因此可以用自制透明眼线纹理或自定义 shader 做视觉覆盖。
- [Blendshapes 示例](https://hiukim.github.io/mind-ar-js-doc/more-examples/threejs-face-blendshapes) 展示 52 个表达系数，并列出 `eyeBlinkLeft/Right`、`eyeLook*`、`eyeSquint*` 等名称；它可帮助做“闭眼时暂停提示”这类 UI 状态，但不是眼线分类器。
- [Virtual Try-On 示例](https://hiukim.github.io/mind-ar-js-doc/face-tracking-examples/tryon) 实际展示的是 glasses、hat、earring 的可见性切换。官方没有提供 eyeliner 类别、眼线边界或化妆完成度判定。

### Occluder 的边界

[官方 Occluder 文档](https://hiukim.github.io/mind-ar-js-doc/face-tracking-quick-start/occluder) 通过一个预定义的头部 3D 模型，让虚拟眼镜的镜腿被“虚拟头”遮挡；文档明确说该模型是预定义形状，未必完全贴合每个人的头。这是渲染层的深度遮挡，不能当作现实手部遮挡识别，也不能当作“眼线被眼睑遮挡”的真实视觉判断。

### 技术栈、浏览器和手机约束

- A-Frame 版本可用少量 HTML 构造场景；Three.js 版本提供更直接的 `MindARThree` API。页面必须用本地/远程 Web 服务器运行，因为摄像头权限不能由直接打开的 `file://` 页面可靠获得。
- `src/face-target/face-mesh-helper.js` 目前从 `@mediapipe/tasks-vision` 创建 `FaceLandmarker`，用 GPU delegate、`runningMode: "IMAGE"`、`numFaces: 1`；模型资产路径是 Google Storage 的 Face Landmarker `.task` 文件。也就是说，MindAR 的高层 AR API 并不等于独立的眼线模型。
- README 建议桌面浏览器和手机都测试，但没有一张官方手机浏览器/帧率兼容矩阵；不能把“WebGL + Web Worker”当作所有低端手机的性能保证。首次加载还会受 JS、WASM、模型和外部 CDN 影响。

### 代码、模型和素材的许可证边界

[MindAR LICENSE](https://github.com/hiukim/mind-ar-js/blob/master/LICENSE) 是 MIT，适用于仓库代码。Face Landmarker 依赖、Google Storage 上的 `.task` 模型、文档示例中的 GLB/GLTF/纹理和 A-Frame/Three.js 仍是独立依赖或资产；仓库根 LICENSE 不会自动替它们授予同样的 MIT 条款。README 的 blendshapes 示例还注明浣熊模型来自 MediaPipe，应把该示例模型的来源/许可另行记录。

### 实际建议

若目标只是“把一条预设眼线贴在脸上”，MindAR 是新增候选里最省相机、镜像、跟踪、滤波、anchor 和渲染接线的路线；可以先尝试 face mesh 透明纹理，再按需要换 Three.js shader。若目标是评估线条是否越过眼尾、是否沿眼睑走，MindAR 的官方高层 API仍需自己从 mesh/关键点做规则，不能把 `faceOccluder` 误当成质量判定。

## 3. TensorFlow.js face-landmarks-detection

### 可复用模块与“是不是眼线”

[官方 README](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/README.md) 说明此包用于实时人脸检测和 landmark tracking；当前 README 描述 MediaPipe FaceMesh 选项，单张脸有 478 个 keypoint，并返回人脸框与每个点的 `x/y/z`。基础调用是 `createDetector(...)` 后执行 `detector.estimateFaces(image)`。

对本题最有用的是轮廓数据，而不是“虚拟化妆成品”：

- [constants.ts](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/constants.ts) 明确导出 `leftEye`、`rightEye`、`leftEyebrow`、`rightEyebrow`、`leftIris`、`rightIris`、`lips` 等轮廓点索引。
- [TFJS detector](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/tfjs/detector.ts) 的实现可返回 468 点；`refineLandmarks: true` 时还处理更细的嘴唇/眼睛/虹膜输出，最多得到 478 点，并支持 `maxFaces`。
- [MediaPipe runtime detector](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/mediapipe/detector.ts) 则把 MediaPipe FaceMesh 输出翻译成同样的 `Face`/keypoints 接口，支持水平翻转配置。

这足以自己在 Canvas 2D、SVG、WebGL 或 Three.js 中将左右眼轮廓连成一条可平滑的线。可以另用上下眼睑点的相对距离尝试闭眼启发式，但需要实测；不要把其他 Face Landmarker 接口的 `eyeBlink*` 表情系数当成这个 TFJS 包已提供的输出。包本身没有 eyeliner class、已有 eyeliner mask、涂抹路径、颜色识别或“画得好不好”的评分逻辑。

### 技术栈、浏览器和手机约束

- [package.json](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/package.json) 当前版本字段为 `1.0.6`，代码是 TypeScript/JavaScript；peer dependencies 包括 TensorFlow.js core/converter、WebGL backend，以及可选的 `@mediapipe/face_mesh`。
- `runtime: "mediapipe"` 需要加载 MediaPipe web solution；`runtime: "tfjs"` 需要脸部 detector 和 landmark GraphModel。TFJS runtime 默认 landmark model URL 在 [tfjs constants.ts](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/tfjs/constants.ts) 中，分别指向 TF Hub 的 `face_mesh/1` 或 `attention_mesh/1`，并允许自定义模型 URL。
- 该包是模型/关键点层，不负责摄像头权限、HTTPS、画布尺寸、镜像显示、响应式布局或渲染；这些必须在 demo 层补齐。官方资料没有给出统一的手机机型/浏览器/帧率矩阵，因此只能把是否支持 WebGL/相关 runtime 和实际设备测量列为验收项。
- 模型卡和运行时资产与包代码分开：README 链接了 FaceMesh 与 iris 的 model card。下载、打包或离线交付前应核对 TF Hub/MediaPipe 模型和 WASM 的许可与再分发条款。

### 代码、模型和许可证边界

[tfjs-models 根 LICENSE](https://github.com/tensorflow/tfjs-models/blob/master/LICENSE) 和源码文件头是 Apache 2.0；这是 TensorFlow.js model wrapper/源码的许可证。TF Hub 的 GraphModel、MediaPipe web solution、模型卡和任何外部 WASM/权重不是因为 wrapper 采用 Apache 2.0 就自动拥有相同条款，必须把代码、runtime 和模型分别列入交付清单。

### 实际建议

如果演示需要回答“眼线应沿哪里走”“当前是否闭眼”“线条是否跑出眼尾范围”，TFJS 是三者里最合适的底层：关键点和眼部轮廓直接可用，算法边界也更容易解释。代价是需要自己做时序滤波、线条几何/着色、光照和肤色鲁棒性，以及任何“完成度”判定的样本和验收。

## 实时覆盖和真实教学不是一件事

这三个项目能省掉的是摄像头接入、脸框/网格跟踪、部分滤波、WebGL/Three.js/A-Frame 的定位接线；它们都不会自动回答以下问题：

1. 用户画的是不是眼线，而不是睫毛、眼影或阴影；
2. 左右眼哪一侧是目标，以及镜像预览和真实左右的转换；
3. 线条是否连续、粗细是否在允许范围、眼尾终点是否越界；
4. 手、睫毛、眼镜、闭眼、弱光、反光、肤色和手机前摄压缩下是否仍应判定为正确；
5. 什么时候应该提示“停笔/抬高/向外拉”，以及提示后是否真正改善。

因此，实时覆盖 demo 可以先用预设路径和透明纹理做可视化；真实教学需要至少一个明确任务定义、受控样本（未画/已画/错误路径）、误报和漏报阈值、时序状态和目标用户验证。没有这些边界，不应把关键点距离或像素差直接描述成“眼线识别准确率”。

## 只用模型/基础库自己写 demo：难度判断

### 小范围覆盖版：中低难度

目标限定为单人、前置摄像头、单侧、预设一种黑色眼线、实时显示参考线或半透明覆盖，且不承诺判断是否画好。MindAR 可以省掉 AR 场景和锚点接线，Jeeliz 可以复用全脸纹理覆盖，TFJS 可以直接把眼轮廓点交给自绘层。剩余工作主要是：

- 摄像头权限、HTTPS、手机横竖屏和镜像；
- 选定目标侧并做左右映射；
- 用眼轮廓点生成曲线/带宽，做短时平滑和丢脸降级；
- 自制眼线纹理、Canvas/Three.js 层和操作提示；
- 在至少一台桌面浏览器和一台手机上测模型加载、延迟、遮挡和画面裁切。

这类 demo 的工程风险可控，真正花时间的是视觉调参和移动端兼容，而不是训练模型。它仍然是“实时覆盖绘制”，不是“真实眼线识别”。

### 加入自动识别与纠错反馈：中高难度

一旦要判断起点、终点、贴合眼睑、厚度、连续性或实时给出动作提示，难度会从“接模型和画线”上升到“定义可验证的视觉任务”。至少要增加：

- 眼睛/人脸坐标归一化和镜像规则；
- 参考轨迹与用户实际痕迹的定义（RGB 自拍不等于稳定的眼线分割）；
- 遮挡/眨眼/头部旋转/光照变化的状态机；
- 受控样本、阈值选择、误报/漏报记录和目标用户测试；
- 低置信度时暂停判断并要求重拍，而不是生成看似精确的反馈。

若没有标注数据和验证时间，建议把交付口径收敛成“辅助定位和实时可视化”，把“教学评分”标为后续实验；若必须展示教学，可以只做规则透明的少量反馈，例如“请睁眼/请正对镜头/参考线超出眼尾”，并明确它不是化妆效果认证。

## 官方来源索引

- Jeeliz： [仓库与 README](https://github.com/jeeliz/jeelizFaceFilter)、[football makeup 源码](https://github.com/jeeliz/jeelizFaceFilter/blob/master/demos/threejs/football_makeup/main.js)、[FaceFilter LICENSE](https://github.com/jeeliz/jeelizFaceFilter/blob/master/LICENSE)。
- MindAR： [仓库与 README](https://github.com/hiukim/mind-ar-js)、[Face Tracking Quick Start](https://hiukim.github.io/mind-ar-js-doc/face-tracking-quick-start/webpage)、[Virtual Try-On](https://hiukim.github.io/mind-ar-js-doc/face-tracking-examples/tryon)、[Occluder](https://hiukim.github.io/mind-ar-js-doc/face-tracking-quick-start/occluder)、[ThreeJS face source](https://github.com/hiukim/mind-ar-js/blob/master/src/face-target/three.js)、[Face mesh helper](https://github.com/hiukim/mind-ar-js/blob/master/src/face-target/face-mesh-helper.js)、[MindAR LICENSE](https://github.com/hiukim/mind-ar-js/blob/master/LICENSE)。
- TensorFlow.js： [face-landmarks-detection README](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/README.md)、[package.json](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/package.json)、[constants.ts](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/constants.ts)、[TFJS detector](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/tfjs/detector.ts)、[MediaPipe detector](https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection/src/mediapipe/detector.ts)、[tfjs-models LICENSE](https://github.com/tensorflow/tfjs-models/blob/master/LICENSE)。
