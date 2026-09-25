import { describe, expect, it, vi } from "vitest";
import {
  createSpeechGuide,
  currentGuidance,
  SpeechGuide,
} from "./useSpeechGuidance";

function setup() {
  const synthesis = { cancel: vi.fn(), speak: vi.fn() };
  const makeUtterance = vi.fn((text: string) => ({ text })) as never;
  return { guide: new SpeechGuide(synthesis, makeUtterance), synthesis };
}

describe("SpeechGuide", () => {
  it("is opt-in and stops when switched off", () => {
    const { guide, synthesis } = setup();
    guide.announce("step:wing", "进入画眼尾步骤。");
    expect(synthesis.speak).not.toHaveBeenCalled();
    guide.setEnabled(true);
    guide.announce("step:wing", "进入画眼尾步骤。");
    expect(synthesis.speak).toHaveBeenCalledOnce();
    guide.setEnabled(false);
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
  });

  it("announces a step once and cancels old speech before a new event", () => {
    const { guide, synthesis } = setup();
    guide.setEnabled(true);
    guide.announce("step:wing", "画眼尾");
    guide.announce("step:wing", "画眼尾");
    guide.announce("step:connect", "连接外段");
    expect(synthesis.speak).toHaveBeenCalledTimes(2);
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
  });

  it("cancels speech when stopped or unmounted", () => {
    const { guide, synthesis } = setup();
    guide.setEnabled(true);
    guide.stop();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
  });

  it("returns no controller when the browser API is unavailable", () => {
    expect(createSpeechGuide({})).toBeNull();
  });

  it("announces the current step and eye position when enabled", () => {
    expect(currentGuidance("wing", true, true)).toBe(
      "语音指引已开启。当前步骤：画眼尾。眼部定位成功。",
    );
  });

  it("does not queue speech while the page is hidden", () => {
    const synthesis = { cancel: vi.fn(), speak: vi.fn() };
    const guide = new SpeechGuide(
      synthesis,
      ((text: string) => ({ text })) as never,
      () => false,
    );
    guide.setEnabled(true);
    guide.announce("result:1", "检查结果");
    expect(synthesis.speak).not.toHaveBeenCalled();
  });
});
