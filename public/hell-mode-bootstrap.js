try {
  if (localStorage.getItem("aaidle:hell-mode-active:v1") === "true") {
    document.documentElement.classList.add("hell-mode");
  }
} catch {
}
