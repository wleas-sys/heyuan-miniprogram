const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createHarness}=require('./harness.cjs'),root=path.resolve(__dirname,'..'),media=require('../utils/media'),groups=require('../utils/gallery-packages'),data=require('../utils/data');
test('27个有图景点各有3–4张独立图片，合计90张，逐图来源与文件完整',()=>{
 assert.equal(media.length,90);assert.equal(Object.keys(groups).length,27);const hashes=new Set();
 const withImages=data.PLACES.filter(p=>groups[p.id]);assert.equal(withImages.length,27);
 for(const place of withImages){const rows=media.filter(m=>m.id===place.id);assert.ok(rows.length>=3&&rows.length<=4,place.id);assert.equal(rows[0].file,'/assets/covers/'+place.id+'.jpg');
  for(const m of rows){assert.ok(fs.existsSync(root+m.file),m.file);assert.match(m.source,/^https?:\/\/[^/]+\/.+/);assert.ok(m.subject&&m.author);assert.ok(m.width>0&&m.height>0);assert.equal(fs.statSync(root+m.file).size,m.bytes);if(m!==rows[0])assert.ok(m.file.startsWith('/'+groups[place.id]+'/'));const hash=crypto.createHash('sha256').update(fs.readFileSync(root+m.file)).digest('hex');assert.ok(!hashes.has(hash),'重复图片 '+m.assetId);hashes.add(hash);}
 }
});
test('每个有图景点从正确分包打开全部轮播，可预览最后一张，分享仍定位同一地点',()=>{
 for(const place of data.PLACES.filter(p=>groups[p.id])){const h=createHarness(),ui=h.module('utils/ui.js');ui.detail(place.id);assert.equal(h.last('navigateTo').url,ui.detailUrl(place.id));const p=h.load(groups[place.id]+'/pages/attraction-detail/attraction-detail.js');p.onLoad({id:place.id});p.onShow();assert.equal(p.data.galleryPending,false);assert.equal(p.data.photos.length,place.images.length);const last=p.data.photos.length-1;p.imageChange({detail:{current:last}});assert.equal(p.data.currentPhoto,last);p.preview(h.event({index:last}));assert.equal(h.last('previewImage').urls.length,place.images.length);assert.equal(h.last('previewImage').current,place.images[last].file);assert.equal(p.onShareAppMessage().path,ui.detailUrl(place.id));}
});
test('旧详情链接转入正确分包；下载失败可重试，不请求其他包的图片',()=>{
 const place=data.PLACES.find(p=>groups[p.id]!=='pkg-detail'),h=createHarness();let tries=0;h.wx.redirectTo=o=>{tries++;if(tries===1)o.fail({})};
 const p=h.load('pkg-detail/pages/attraction-detail/attraction-detail.js');p.onLoad({id:place.id});p.onShow();assert.equal(tries,1);assert.equal(p.data.galleryError,true);assert.ok(p.data.photos.every(m=>m.file.startsWith('/assets/')));p.openFullGallery();assert.equal(tries,2);
});
test('旧朋友圈预览只读主包封面，进入完整小程序后再打开图集',()=>{
 const place=data.PLACES.find(p=>groups[p.id]!=='pkg-detail'),h=createHarness();let target='';h.wx.redirectTo=o=>{target=o.url};h.setScene(1154);const p=h.load('pkg-detail/pages/attraction-detail/attraction-detail.js');p.onLoad({id:place.id});p.onShow();p.openFullGallery();assert.equal(target,'');assert.equal(p.data.photos.length,1);assert.match(h.last('showToast').title,/前往小程序/);h.setScene(1001);p.onShow();assert.equal(target,h.module('utils/ui.js').detailUrl(place.id));
});
test('主包与3个详情分包各自低于2MiB，首页预载只包含一个分包',()=>{
 const app=require('../app.json'),ignore=require('../project.config.json').packOptions.ignore,roots=app.subpackages.map(p=>p.root),sizes={main:0,...Object.fromEntries(roots.map(r=>[r,0]))};
 function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,f.name),rel=path.relative(root,abs).replaceAll('\\','/');if(rel.startsWith('.')||/^project\.(private\.)?config\.json$/.test(rel)||ignore.some(i=>i.type==='folder'?(rel===i.value||rel.startsWith(i.value+'/')):rel===i.value))continue;if(f.isDirectory())walk(abs);else sizes[roots.find(r=>rel.startsWith(r+'/'))||'main']+=fs.statSync(abs).size;}}
 walk(root);assert.equal(roots.length,3);for(const [key,size]of Object.entries(sizes))assert.ok(size<2*1024*1024,key+': '+size);assert.deepEqual(app.preloadRule['pages/index/index'].packages,['pkg-detail']);
});
