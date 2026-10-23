const CITY_STORAGE_KEY = "prometey-city";

function selectedCity() {
  return localStorage.getItem(CITY_STORAGE_KEY) || "Київ";
}

async function populateCitySelects() {
  const response = await fetch("/api/cities");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не вдалося завантажити міста.");
  document.querySelectorAll("[data-city-select]").forEach((select) => {
    const previous = select.value || selectedCity();
    select.innerHTML = data.cities.map((city) =>
      `<option value="${city.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")}">${city.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</option>`,
    ).join("");
    select.value = data.cities.includes(previous) ? previous : data.cities[0];
    select.addEventListener("change", () => {
      localStorage.setItem(CITY_STORAGE_KEY, select.value);
      document.querySelectorAll("[data-city-select]").forEach((other) => {
        if (other !== select) other.value = select.value;
      });
    });
  });
}

populateCitySelects().catch((error) => {
  console.error(error);
  document.querySelectorAll("[data-city-select]").forEach((select) => {
    select.innerHTML = '<option value="Київ">Київ</option>';
  });
});
