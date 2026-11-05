const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createHarness}=require('./harness.cjs');
const open=h=>{const p=h.load('pkg-detail/pages/attraction-detail/attraction-detail.js');p.onLoad({id:'guifengta'});p.onShow();return p};
test('旧随手记可直接编辑，新内容仅存本机，重开可恢复且不进入分享',()=>{
 const h=createHarness({'wanlv.v22.note.guifengta':{text:'旧记',updatedAt:1}}),p=open(h);
 assert.equal(p.data.noteText,'旧记');p.writeNote();p.noteInput(h.event({},'私人内容'));p.saveNote();assert.match(p.data.noteStatus,/本机/);
 assert.equal(open(h).data.noteText,'私人内容');assert.ok(!JSON.stringify(p.onShareAppMessage()).includes('私人内容'));assert.ok(!JSON.stringify(p.onShareTimeline()).includes('私人内容'));
 assert.equal(p.publishComment,undefined);assert.equal(p.loadComments,undefined);
});
test('离开自动保存；清空后保存只删除当前景点随手记',()=>{
 const h=createHarness(),p=open(h);h.module('utils/notes.js').save('wanlvhu','另一景点');p.noteInput(h.event({},'记一笔'));p.onHide();assert.equal(open(h).data.noteText,'记一笔');p.noteInput(h.event({},''));p.saveNote();assert.equal(open(h).data.noteText,'');assert.equal(h.module('utils/notes.js').read('wanlvhu').text,'另一景点');
});
test('本机读取或写入失败时不覆盖原记、不假报成功，恢复读取后可重试',()=>{
 const h=createHarness({'wanlv.v22.note.guifengta':{text:'原记',updatedAt:1}});h.failures.read=true;const p=open(h);p.noteInput(h.event({},'输入'));h.failures.read=false;p.saveNote();assert.equal(h.memory['wanlv.v22.note.guifengta'].text,'原记');assert.equal(p.data.noteStatus,'');
 h.replies.push({confirm:true});p.reloadNote();assert.equal(p.data.noteText,'原记');p.noteInput(h.event({},'修改'));h.failures.write=true;p.closeNote();assert.equal(h.memory['wanlv.v22.note.guifengta'].text,'原记');assert.match(p.data.noteError,/存储/);h.failures.write=false;p.saveNote();assert.equal(open(h).data.noteText,'修改');
});
test('两个页面编辑同一随手记时，旧页面不会覆盖已更新内容',()=>{
 const h=createHarness(),a=open(h),b=open(h);a.noteInput(h.event({},'A'));b.noteInput(h.event({},'B'));b.saveNote();a.saveNote();assert.match(a.data.noteError,/其他页面/);assert.equal(open(h).data.noteText,'B');
});
test('朋友圈预览不读取或显示私人数据、不允许保存',()=>{
 const seed={'wanlv.v22.note.guifengta':{text:'秘密',updatedAt:1},'wanlv.v22.comment-draft.guifengta':{text:'旧稿',updatedAt:1}},h=createHarness(seed);h.setScene(1154);const p=open(h);assert.equal(p.data.noteText,'');assert.equal(p.data.previousDraft,'');p.writeNote();p.noteInput(h.event({},'禁止'));p.saveNote();assert.deepEqual(h.memory,seed);
});
test('原评论本机草稿独立保留，取消删除和保存失败均不丢失',()=>{
 const h=createHarness({'wanlv.v22.comment-draft.guifengta':{text:'旧稿',updatedAt:1}}),p=open(h);assert.equal(p.data.previousDraft,'旧稿');assert.equal(p.data.noteText,'');p.togglePreviousDraft();assert.equal(p.data.previousDraftOpen,true);h.replies.push({confirm:false});p.deletePreviousDraft();assert.equal(p.data.previousDraft,'旧稿');h.failures.write=true;h.replies.push({confirm:true});p.deletePreviousDraft();assert.equal(p.data.previousDraft,'旧稿');h.failures.write=false;h.replies.push({confirm:true});p.deletePreviousDraft();assert.equal(open(h).data.previousDraft,'');
});
test('实际页面只提供随手记与本地声明，不再有评论列表和发布入口',()=>{
 const w=fs.readFileSync(__dirname+'/../shared/attraction-detail.wxml','utf8'),about=fs.readFileSync(__dirname+'/../pages/about/about.wxml','utf8');
 assert.match(w,/数据仅保存在本机/);assert.match(w,/不上传、不公开/);assert.match(w,/保存到本机/);assert.ok(!/评论|发布|publishComment|loadComments/.test(w));assert.ok(!/评论|尚未开放/.test(about));
});
