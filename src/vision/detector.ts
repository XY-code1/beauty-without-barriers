import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
export type FaceDetector = Pick<FaceLandmarker, "detectForVideo" | "close">;
let detectorPromise: Promise<FaceDetector> | null = null;

async function initializeDetector(): Promise<FaceDetector> {
  const files = await FilesetResolver.forVisionTasks(
    `${import.meta.env.BASE_URL}assets/wasm`,
  );
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: `${import.meta.env.BASE_URL}assets/face_landmarker.task`,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export function createDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = initializeDetector().catch((error) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

export function preloadDetector(): void {
  void createDetector().catch(() => undefined);
}
