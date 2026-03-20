/** 懒加载 YouTube IFrame API（多实例安全：共享一次 Promise） */
let iframeApiPromise: Promise<void> | null = null;

export function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  const w = window as Window & {
    YT?: { Player: new (id: string | HTMLElement, options: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  };

  if (w.YT?.Player) {
    return Promise.resolve();
  }

  if (!iframeApiPromise) {
    iframeApiPromise = new Promise<void>((resolve) => {
      const previous = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };

      const existing = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existing) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    });
  }

  return iframeApiPromise;
}

/** 最小类型，避免依赖 @types/youtube */
export type YTPlayer = {
  getCurrentTime: () => number;
  destroy: () => void;
};
