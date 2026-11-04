/** Fixed, non-personal sample phrases for testing Chrome tab audio capture. */
export const AUDIO_SAMPLES = [
  {
    id: "introduction-en",
    title: "English · Interview introduction",
    locale: "en-US",
    text: "Hello, thank you for joining today's interview. Can you introduce yourself and tell me about your experience with Golang?",
  },
  {
    id: "golang-en",
    title: "English · Goroutines and channels",
    locale: "en-US",
    text: "Can you explain the difference between goroutines and operating system threads? When would you choose a channel instead of a mutex?",
  },
  {
    id: "rails-en",
    title: "English · Ruby on Rails",
    locale: "en-GB",
    text: "How do you diagnose slow database queries in a Ruby on Rails application, and how would you prevent N plus one queries?",
  },
  {
    id: "system-design-en",
    title: "English · System design",
    locale: "en-US",
    text: "Imagine our service has to process one hundred thousand jobs per minute. How would you design it to handle failures and retries reliably?",
  },
  {
    id: "follow-up-en",
    title: "English · Follow-up question",
    locale: "en-US",
    text: "You mentioned Redis and Kafka in your previous answer. Can you give me a specific example of when you used them in production?",
  },
  {
    id: "golang-vi",
    title: "Tiếng Việt · Câu hỏi Golang",
    locale: "vi-VN",
    text: "Chào bạn. Hãy giải thích sự khác nhau giữa goroutine và thread. Trong tình huống nào bạn sẽ sử dụng channel?",
  },
] as const;

export type AudioSampleId = (typeof AUDIO_SAMPLES)[number]["id"];
