let sonActif=false,audio=null;
function initSon(){audio=new Audio('../audio/dede.mp3');audio.loop=true;audio.volume=0.3;}
function toggleSonGlobal(){
    if(!audio)initSon();
    sonActif=!sonActif;
    if(sonActif){audio.play();localStorage.setItem('son','on');}
    else{audio.pause();localStorage.setItem('son','off');}
    document.querySelectorAll('.btn-son').forEach(btn=>btn.textContent=sonActif?'🔇':'🔊');
}
document.addEventListener('DOMContentLoaded',()=>{
    if(localStorage.getItem('son')==='on')setTimeout(toggleSonGlobal,100);
    document.querySelectorAll('.btn-son').forEach(btn=>btn.onclick=toggleSonGlobal);
});
