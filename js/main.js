// ================================================================================================
// js/main.js — 起動
// start everything once all the files above are loaded
// (loaded 12/12: may use anything from the files loaded before it)
// ================================================================================================
renderSaveInfo();
buildWorld('island');
requestAnimationFrame(frame);
if (typeof Peer === 'undefined') {
  $('create').disabled = $('create-coop').disabled = $('create-story').disabled = $('join').disabled = true;
  lobbyMsg('通信用の部品を読み込めませんでした。ページを再読み込みしてください。', true);
}
