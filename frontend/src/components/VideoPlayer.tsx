/** Видео урока. Если ссылки нет — красивая заглушка. Поддерживает mp4 и YouTube/Vimeo embed. */
export function VideoPlayer({ url, title }: { url?: string; title: string }) {
  if (!url) {
    return (
      <div className="video placeholder" aria-label="Видео скоро появится">
        <div className="play">▶</div>
        <p>Видео «{title}» скоро появится</p>
      </div>
    );
  }
  const embed = /youtube\.com|youtu\.be|vimeo\.com|\/embed\//.test(url);
  return (
    <div className="video">
      {embed ? <iframe src={url} title={title} allowFullScreen /> : <video src={url} controls playsInline />}
    </div>
  );
}
