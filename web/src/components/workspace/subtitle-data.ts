/**
 * Mock 字幕数据，后续可替换为 API 返回。
 */
export interface SubtitleLine {
  timestamp: string; // 显示用，如 "00:01:23"
  timestampSeconds?: number; // 用于跳转
  en: string;
  zh: string;
}

export const MOCK_SUBTITLES: SubtitleLine[] = [
  { timestamp: "00:00:01", timestampSeconds: 1, en: "Welcome to this lesson.", zh: "欢迎来到本节课。" },
  { timestamp: "00:00:08", timestampSeconds: 8, en: "Today we'll cover the basics.", zh: "今天我们将介绍基础知识。" },
  { timestamp: "00:00:15", timestampSeconds: 15, en: "What is machine learning?", zh: "什么是机器学习？" },
  { timestamp: "00:00:23", timestampSeconds: 23, en: "It's a subset of artificial intelligence.", zh: "它是人工智能的一个子集。" },
  { timestamp: "00:00:31", timestampSeconds: 31, en: "We train models on data.", zh: "我们用数据训练模型。" },
  { timestamp: "00:00:40", timestampSeconds: 40, en: "The model then makes predictions.", zh: "模型随后进行预测。" },
  { timestamp: "00:00:48", timestampSeconds: 48, en: "Supervised and unsupervised learning.", zh: "监督学习与无监督学习。" },
  { timestamp: "00:00:56", timestampSeconds: 56, en: "Let's look at an example.", zh: "我们来看一个例子。" },
  { timestamp: "00:01:05", timestampSeconds: 65, en: "Here we have a simple dataset.", zh: "这里有一个简单的数据集。" },
  { timestamp: "00:01:14", timestampSeconds: 74, en: "We can use it to train our model.", zh: "我们可以用它来训练模型。" },
  { timestamp: "00:01:23", timestampSeconds: 83, en: "This is the key concept.", zh: "这是核心概念。" },
  { timestamp: "00:01:30", timestampSeconds: 90, en: "Thank you for watching.", zh: "感谢观看。" },
];

/** 当前播放位置对应的行索引（mock：第 3 行高亮） */
export const MOCK_CURRENT_INDEX = 2;

/** 中文翻译占位文案（未接入 DeepSeek 时显示） */
export const ZH_PLACEHOLDER = "翻译中...";
export const ZH_UNAVAILABLE = "翻译暂不可用";
