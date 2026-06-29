declare module 'ffmpeg-static' {
  // Percorso assoluto del binario ffmpeg, oppure null su piattaforme non supportate.
  const ffmpegPath: string | null;
  export default ffmpegPath;
}
