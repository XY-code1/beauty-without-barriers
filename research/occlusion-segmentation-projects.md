# 单侧眼线辅助：遮挡与眼周/妆容分割开源项目核查

核查日期：2026-09-23（Asia/Shanghai）。本笔记只做源码、官方文档和仓库许可核查，没有安装依赖、下载权重或运行模型。目标是给已有的 MediaPipe Face Landmarker（单脸定位与平滑）补充“手是否挡住眼周”的证据，并确认是否存在可以直接判断真实眼线的开源模型。

## 结论先行

- 本次核查没有找到可以直接给出“眼线存在/缺失/画歪/被遮挡”的可靠开源现成模型。Face parsing 的 `l_eye`/`r_eye` 是眼部器官区域，不能等同于眼线区域；手部 landmarks 也不是遮挡真值。
- 第一版可以不做真实妆容评价。建议先验证“看参考 → 用户动手 → 手移开后确认当前眼周可见 → 用户手动继续/重试”。这可以演示候选交互流程；是否帮助美妆新手、是否满足无障碍需求，仍需对应目标用户的实际测试，不能由技术演示直接证明。
- 如果要补充实时遮挡启发式，首选官方 [MediaPipe Hand Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)：输出手的 21 个图像/世界坐标 landmarks 与左右手，可与现有 Face Landmarker 的单眼 ROI 做重叠或距离启发式。它没有遮挡标签；模型卡还明确把带遮挡的手部 landmark 预测列为不适用场景，因此应把结果命名为“可能挡住/暂不可判定”，而不是“确认遮挡”。
- 如果未来需要眼周区域 mask，`yakhyo/face-parsing` 比老仓库更适合做后端或独立 worker 的候选：它有 ONNX 导出和 43 MB/82 MB 的 ResNet18/34 权重。但它仍只输出 19 类脸部语义分割，没有 eyeliner 或 occlusion 类别，也没有官方浏览器推理实现。
- `zllrunning/face-parsing.PyTorch` 可作为原始 19 类 BiSeNet 的参考；其代码 MIT，但训练数据 CelebAMask-HQ 另有“仅非商业研究/教育”的数据协议，且仓库只给出 PyTorch/CUDA 训练和 Google Drive 权重链接，没有清晰的单独权重许可。它不适合直接塞进手机网页。
- 作为补充排除参考，真正面向妆容图案的 [VinAIResearch/CPM](https://github.com/VinAIResearch/CPM) 也不是眼线评价模型。它的 Pattern Branch 学的是妆容图案/贴纸的二值 mask，再用于从参考妆容向目标脸迁移；默认代码没有 eyeliner 类别，且依赖 Python 3.7、PyTorch 1.6、TensorFlow GPU 1.14、CUDA 10.1 和 PRNet，数据集还限制为研究/教育用途并禁止再分发。它适合回答“研究中如何处理妆容图案”，不适合第一版实时浏览器。

## 输出类别与用途对照

| 候选 | 实际输出 | 是否有 `eyeliner` / `occlusion` 真值 | 浏览器与实时成本 | 结论 |
|---|---|---|---|---|
| MediaPipe Hand Landmarker | 每只手的 handedness、21 个 2D screen landmarks、21 个 world landmarks | 没有；手靠近眼区只能构成启发式证据 | 官方 JS/WASM 包，支持 VIDEO；同步调用会阻塞 UI，官方建议 Web Worker | 适合 v1 做“手可能挡住眼区”的门控 |
| zllrunning/face-parsing.PyTorch | 19 类 BiSeNet 语义 mask：背景 + `skin`、左右眉、左右眼、`eye_g`、左右耳、`ear_r`、鼻、口、上下唇、颈部、衣物、头发、帽子 | 没有；`l_eye`/`r_eye` 是眼部区域，`eye_g` 是眼镜区域，不是眼线 | PyTorch；训练脚本使用 NCCL 分布式 CUDA，推理示例也假设 GPU | 可作类别/数据参考，不能直接用于网页或眼线判断 |
| yakhyo/face-parsing | 同一套 19 类 `ATTRIBUTES`；推理对输出 logits 做 `argmax` 得到类别 mask | 没有；源码没有 eyeliner/occlusion 类 | PT/ONNX，输入固定 resize 到 512×512；ONNX 示例用 Python `onnxruntime`，没有 Web 推理代码 | 后续后端/独立 worker 候选；不作为 v1 依赖 |
| （补充排除）VinAIResearch/CPM Pattern Branch | 默认训练配置 `classes=[0]`，从 RGBA mask 绿色通道取一个二值 pattern mask；注释中的完整类名也只有 face parts/sticker，没有 eyeliner | 没有；它分割“参考妆容图案/贴纸前景”，不是识别真实眼线，也不输出遮挡 | Python/CUDA 研究栈，需 PRNet、TensorFlow 1.x、旧版 PyTorch 与 GPU | 研究参照或未来离线实验；排除出 v1 |

## 1. MediaPipe Hand Landmarker：适合做遮挡启发式，不是遮挡标签

官方总览说 Hand Landmarker 的任务是检测手部 landmarks，输出只有三组：检测手的左右手类别、图像坐标 landmarks、世界坐标 landmarks；每只手有 21 个 landmarks。官方文档还说明视频/直播模式会用追踪减少 palm detector 的调用。[总览与输出](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#task_details)

Web 版通过 `@mediapipe/tasks-vision` 和 `.task` model bundle 接入，支持 `IMAGE` 与 `VIDEO`；`detect()`/`detectForVideo()` 是同步调用，会阻塞用户界面线程，官方建议在 Web Worker 里运行连续视频推理。[Web JS 安装、运行和 Worker 建议](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js#run_the_task)

因此可以把它与现有 Face Landmarker 组合成如下证据链：

1. 用 Face Landmarker 的左右眼关键点定义单眼 ROI。
2. 用 Hand Landmarker 的手掌/指尖 landmarks 形成粗略手部 hull 或距离范围。
3. 当手部 hull 与目标眼 ROI 有重叠、或指尖持续靠近眼 ROI 时，进入“可能被手挡住”状态；用连续帧滞回避免闪烁。
4. 手离开后只恢复到“可继续确认”的状态，必要时让用户手动确认；不要声称模型判断了真实眼线。

这不是模型提供的遮挡真值。官方 Hand Tracking model card 的 out-of-scope 部分明确写着，带手套或遮挡（例如手拿物体、手部装饰）的手部 landmark 预测不适用；同一 model card 还指出模糊或遮挡的 joints 误差更大。[Model Card，输出/许可/适用范围](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf#page=2)

许可需要分开看：Google Developers 页面将代码示例标为 Apache 2.0；Hand Tracking model card 也写明模型以 Apache 2.0 授权。具体发布物和第三方依赖仍应在落地时保留相应 NOTICE。[官方 Web 文档许可说明](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js#handle_and_display_results)、[model card 第 2 页](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf#page=2)

## 2. zllrunning/face-parsing.PyTorch：19 类眼周结构 mask，没有妆容判断

仓库 README 说明它是“modified BiSeNet for face parsing”，训练用 CelebAMask-HQ，训练和测试脚本均为 PyTorch，预训练模型通过 Google Drive 提供。[README](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/README.md#training)

类别要以源码为准，而不是把仓库名里的 makeup 当成妆容识别：

- `prepropess_data.py` 的 `atts` 列出 18 个前景属性：`skin`, `l_brow`, `r_brow`, `l_eye`, `r_eye`, `eye_g`, `l_ear`, `r_ear`, `ear_r`, `nose`, `mouth`, `u_lip`, `l_lip`, `neck`, `neck_l`, `cloth`, `hair`, `hat`；0 是背景。[标签合成源码](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/prepropess_data.py#L14-L32)
- `train.py` 将 `n_classes` 设为 19，并把网络输出作为语义分割 logits。[训练源码](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/train.py#L52-L71)
- `test.py` 只是对 logits 做 `argmax`、保存 parsing map；没有 eyeliner、makeup-present、occluded 等额外 head。[推理/可视化源码](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/test.py#L46-L71)
- 仓库的 makeup 示例实际只改头发和上下唇颜色；`makeup.py` 的 part table 是 hair/upper_lip/lower_lip，没有眼线类别。[makeup 示例源码](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/makeup.py#L74-L99)

它可以帮助定义“左眼/右眼区域”，例如限制后续像素统计或在眼线动作结束后检查眼 ROI 是否仍可见；它不能回答“用户有没有画出眼线”。手挡住眼睛时，输入本身改变，语义 mask 可能变差，但代码没有单独的可见性/遮挡输出。

部署方面，仓库训练脚本直接调用 `torch.cuda.set_device`、NCCL 分布式训练和 `.cuda()`；测试脚本也把模型和输入放到 CUDA。仓库没有 ONNX/TFLite/WebGPU/JavaScript 推理路径。[训练源码](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/train.py#L41-L75)、[测试源码](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/test.py#L46-L70)

许可边界：仓库 `LICENSE` 是 MIT，允许修改和分发代码但要求保留许可文本。[代码许可证](https://github.com/zllrunning/face-parsing.PyTorch/blob/master/LICENSE)；其训练数据 CelebAMask-HQ 的官方协议又明确限制为非商业研究/教育用途，禁止出售、商业利用和再分发数据及衍生数据。[CelebAMask-HQ 数据协议](https://github.com/switchablenorms/CelebAMask-HQ#dataset-agreement)

README 只链接到 Google Drive 预训练模型，没有在仓库 README 或 `LICENSE` 中给出一份单独、清晰的权重许可条款。因此不能把“代码 MIT”简化成“训练数据和权重都可无条件用于参赛产品”。

## 3. yakhyo/face-parsing：更容易转 ONNX，但类别仍然不是眼线

这是较新的 BiSeNet 实现。README 明确提供 PyTorch/ONNX 导出与推理，并给出 ResNet18 约 43 MB、ResNet34 约 82 MB 的模型大小；代码许可证是 MIT。[README 的模型大小、ONNX 和许可证](https://github.com/yakhyo/face-parsing#model-performance)

源码中的 `ATTRIBUTES` 与上一个仓库相同：`skin`, 左右眉、左右眼、`eye_g`、左右耳、`ear_r`、鼻、口、上下唇、颈部、衣物、头发、帽子，共 19 个索引（含背景索引 0）。源码没有 `eyeliner` 或 `occlusion`。[类别常量](https://github.com/yakhyo/face-parsing/blob/main/utils/common.py#L4-L23)、[标签准备](https://github.com/yakhyo/face-parsing/blob/main/utils/prepare_labels.py#L7-L42)

推理脚本把输入 resize 到 512×512，取 `output[0]` 的 `argmax` 作为类别 mask，再恢复到原图大小；ONNX 版本用 Python `onnxruntime.InferenceSession`，CPU/GPU provider 由运行环境决定。[PyTorch 推理](https://github.com/yakhyo/face-parsing/blob/main/inference.py#L20-L44)、[ONNX 推理](https://github.com/yakhyo/face-parsing/blob/main/onnx_inference.py#L20-L101)

这使它比 zll 仓库更适合后续做“服务端抽帧/独立 worker”的技术验证：有发布的 `.onnx` 文件，且 README 给出了模型体积。但仓库没有把 ONNX 接到 `onnxruntime-web`、Web Worker 或手机浏览器摄像头循环中；不能把“有 ONNX”直接写成“浏览器实时可用”。512×512 的整脸分割也比已有 Face Landmarker 的关键点路径重，至少要实测移动端帧率、内存与热量后才能决定。

代码许可与数据许可仍需分开：仓库 `LICENSE` 是 MIT，[代码许可证](https://github.com/yakhyo/face-parsing/blob/main/LICENSE)；README 说模型训练在 CelebAMask-HQ 上，[数据协议](https://github.com/switchablenorms/CelebAMask-HQ#dataset-agreement)限制非商业研究/教育用途。README 的权重下载脚本提供 `.pt`/`.onnx` release 文件，但没有另列一份比仓库 MIT 更具体的权重条款；参赛交付前应做一次权重来源与使用范围复核。[权重下载脚本](https://github.com/yakhyo/face-parsing/blob/main/download.sh)

## 补充排除：VinAIResearch/CPM 真正处理妆容图案，但不是实时眼线评价

CPM（Color-Pattern Makeup Transfer）是本次核查里最接近“真实妆容图案”的研究项目：它有 Color Branch 和 Pattern Branch，目标是把参考妆容的颜色与图案迁移到另一张脸。README 描述了 CPM-Real、CPM-Synt-1/2 和 Stickers 等数据；其中 CPM-Synt-1 明确是用于 Pattern Branch 的带 pattern segmentation mask 数据。[项目 README](https://github.com/VinAIResearch/CPM#cpm-color-pattern-makeup-transfer)、[数据说明](https://github.com/VinAIResearch/CPM/blob/main/about-data.md#cpm-synt-1)

但源码显示它不是一个可直接拿来做眼线识别的多类 parser：

- `Pattern/parser.py` 默认 `--classes` 是 `[0]`，即一个输出通道；`Pattern/models.py` 按 `len(args.classes)` 配置分割模型。[训练参数](https://github.com/VinAIResearch/CPM/blob/main/Pattern/parser.py#L421-L440)、[模型构造](https://github.com/VinAIResearch/CPM/blob/main/Pattern/models.py#L3-L33)
- `Pattern/dataloader.py` 实际取 mask 的绿色通道作为一个二值 mask；注释里的候选类名有 face、眉、眼、鼻、唇、hair、sticker，但没有 eyeliner 类。[数据读取源码](https://github.com/VinAIResearch/CPM/blob/main/Pattern/dataloader.py#L19-L46)
- 主程序使用 `mask > threshold` 把参考图的 pattern 区域贴到目标 texture，依赖一张 style/reference image；它输出迁移结果，不输出“当前用户的眼线质量”或“眼周被手挡住”的判断。[主流程](https://github.com/VinAIResearch/CPM/blob/main/main.py#L15-L44)

部署成本也不匹配手机网页：README 要求 Python 3.7、PyTorch 1.6、TensorFlow GPU 1.14 和 segmentation-models-pytorch；environment 文件还锁定 CUDA 10.1、cuDNN 7.6，并使用 PRNet 的预训练模型。[README requirements](https://github.com/VinAIResearch/CPM#getting-started)、[environment.yml](https://github.com/VinAIResearch/CPM/blob/main/environment.yml#L119-L168)

许可也有两层：代码仓库是 BSD-3-Clause，[代码许可证](https://github.com/VinAIResearch/CPM/blob/main/LICENSE)；CPM 自己的数据下载协议要求仅研究/教育用途、不得以原始或修改形式再分发，并要求引用论文。[数据协议](https://github.com/VinAIResearch/CPM#datasets)

结论是：CPM 可以作为“妆容图案分割/迁移研究”的参考，不能作为第一版真实眼线检查器。它甚至不能在不重新定义任务和标注的情况下回答“眼线是否已经画到位”。

## 许可与数据的统一提醒

不要只看 GitHub 仓库页的绿色 license badge：

1. **代码许可**：zllrunning 与 yakhyo 是 MIT；CPM 是 BSD-3-Clause；MediaPipe 的官方 Web 文档代码示例和 Hand Tracking model card 标注 Apache 2.0。
2. **权重许可**：Google Drive 或 GitHub Release 的下载链接不自动等于与代码相同的授权。zll 的 README 没有单独权重条款；yakhyo 的 README/下载脚本也没有列出额外权重条款；CPM 还依赖 PRNet 权重。
3. **数据许可**：zll/yakhyo 使用的 CelebAMask-HQ 明确是非商业研究/教育用途；CPM 自己发布的数据也限制研究/教育并禁止再分发。若黑客松 Demo 需要公开部署、视频、源代码或后续商业化，应把这些条款作为单独的 release checklist。

## 给当前 Demo 的建议边界

### v1 建议

- 保留 Face Landmarker 的单脸、眼部关键点和平滑。
- 加入 Hand Landmarker，只做“手靠近目标单眼 ROI / 画面当前可能不可见”的门控；连续帧稳定后再提示“请移开手确认”。
- 把流程设计成“看参考 → 动手 → 移开手后确认”，用户用按钮或语音确认继续。手移开后的确认既是产品交互，也是在没有真实遮挡标注时的诚实边界。
- 评价指标先放在流程层：是否能看到目标眼区、提示是否稳定、手移开后是否能继续、用户是否理解下一步。不要给出“眼线画得好/不好”的自动评分。

### 暂不建议

- 不把 `l_eye`/`r_eye` mask 命名成 eyeliner mask。
- 不把 Hand Landmarker 的 landmarks 或 handedness 当成遮挡标签；尤其不要在手指被眼周、化妆工具或睫毛遮挡时声称模型可靠。
- 不把 CPM 的 pattern mask 当成用户当前妆容分割或眼线质量判定。
- 不为 v1 引入 512×512 的 PyTorch/ONNX face parser；这会增加模型体积、移动端推理和许可核查成本，但不会解决“真实眼线”的标注缺口。

### 后续若必须做真实妆容评价

需要另做一个小而明确的数据闭环：按单眼采集有/无眼线、粗细/断线/越界等定义，并独立标注“手遮挡/工具遮挡/眼睛闭合/画面不可判定”。先训练单眼 ROI 内的专用分割或分类模型，再在不同肤色、光照、镜面反光、睫毛和工具遮挡上做留出测试。CelebAMask-HQ 的眼部结构 mask 可以帮助裁剪区域，但不能替代这些眼线标签。

截至本次核查，尚未找到可直接拿来承担这个真实眼线质量任务、且输出类别、权重许可和浏览器部署路径都清楚的开源模型。
