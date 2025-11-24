const loginBtn = document.getElementById("login-btn");

loginBtn.addEventListener("click", () => {
    window.parent.electron.startAuth();
});
