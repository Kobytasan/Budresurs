const form = document.querySelector("#support-form");
const message = document.querySelector("#support-message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  message.textContent = "";
  button.disabled = true;
  try {
    const response = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(values)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не вдалося надіслати звернення.");
    form.reset();
    message.textContent = "Дякуємо! Ваше звернення надіслано команді.";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
