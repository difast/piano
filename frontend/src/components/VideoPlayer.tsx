/** Необязательное видео к уроку или песне. Если ссылки нет — ничего не показываем. */
export function VideoPlayer({ url, title }: { url?: string; title: string }) {
  if (!url) return null;
  const embed = /youtube\.com|youtu\.be|vimeo\.com|\/embed\//.test(url);
  return (
    <div className="video">
      {embed ? <iframe src={url} title={title} allowFullScreen /> : <video src={url} controls playsInline />}
    </div>
  );
}
