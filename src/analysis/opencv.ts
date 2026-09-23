import type * as CV from "@techstark/opencv-js";
export type OpenCV = typeof CV;
type Runtime = OpenCV & {
  then?: (ready: (cv: OpenCV) => void) => void;
  onRuntimeInitialized?: () => void;
};
declare global {
  interface Window {
    cv?: Runtime;
  }
}
let loading: Promise<OpenCV> | null = null;
export function loadOpenCV(): Promise<OpenCV> {
  if (loading) return loading;
  // OpenCV's Emscripten thenable must be wrapped to avoid recursive assimilation.
  const ready = new Promise<{ cv: OpenCV }>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 30_000);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("分析组件加载失败，请重试。"));
    };
    script.src = `${import.meta.env.BASE_URL}assets/opencv.js`;
    script.onerror = fail;
    script.onload = () => {
      const runtime = window.cv;
      if (!runtime) {
        fail();
        return;
      }
      const done = (cv: OpenCV) => {
        clearTimeout(timer);
        resolve({ cv });
      };
      if (runtime.Mat) done(runtime);
      else if (runtime.then) runtime.then(done);
      else runtime.onRuntimeInitialized = () => done(runtime);
    };
    document.head.appendChild(script);
  });
  // Strip the legacy then method when returning the usable runtime.
  loading = ready
    .then(({ cv }) => {
      if ("then" in cv)
        Object.defineProperty(cv, "then", {
          value: undefined,
          configurable: true,
        });
      return cv;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}
