(function(){
  const input = document.querySelector('form[data-communities-search] input[name="q"]');
  const form = document.querySelector('form[data-communities-search]');
  const list = document.getElementById("communities-list");
  if(!form || !input || !list) return;

  let timer = null;
  let lastController = null;

  function setLoading(isLoading){
    const btn = form.querySelector('button[type="submit"]');
    if(!btn) return;
    btn.dataset.oldText = btn.dataset.oldText || btn.textContent;
    btn.textContent = isLoading ? "Ищем..." : (btn.dataset.oldText || "Найти");
  }

  async function runSearch(){
    const url = new URL(form.action, window.location.origin);
    url.searchParams.set("q", input.value || "");
    if(lastController) lastController.abort();
    lastController = new AbortController();

    setLoading(true);
    try{
      const resp = await fetch(url.toString(), {
        headers: {"X-Requested-With":"XMLHttpRequest"},
        cache: "no-store",
        signal: lastController.signal
      });
      if(!resp.ok) throw new Error("bad status " + resp.status);
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newList = doc.getElementById("communities-list");
      if(newList) list.innerHTML = newList.innerHTML;
    }catch(e){
      if(e.name !== "AbortError") {}
    }finally{
      setLoading(false);
    }
  }

  input.addEventListener("input", ()=>{
    clearTimeout(timer);
    timer = setTimeout(runSearch, 250);
  });

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    clearTimeout(timer);
    runSearch();
    const url = new URL(form.action, window.location.origin);
    url.searchParams.set("q", input.value || "");
    window.history.replaceState({}, "", url.pathname + url.search);
  });
})();