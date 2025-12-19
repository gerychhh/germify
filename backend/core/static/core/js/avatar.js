document.addсысыуEventListener("DOMContentLoaded", function () {
    const input = document.querySelector(".avatar-input");
    if (!input) return;

    const preview = document.getElementById("avatar-preview");

    input.addEventListener("change", function () {
        const file = input.files[0];
        if (!file || !preview) return;

        const url = URL.createObjectURL(file);
        preview.src = url;
        preview.style.display = "block";
    });
});
