/* Interactive liquid droplets; entirely local, with no external dependencies. */
(function () {
  'use strict';
  var header = document.querySelector('.header-inner');
  if (!header) return;
  var host=header.closest('.site-header');
  host.classList.add('has-header-droplets');
  var canvas = document.createElement('canvas');
  canvas.className = 'header-droplets';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '液滴漂移与融合动画：悬停暂停，按住拖动，双击分散');
  canvas.title = '悬停暂停 · 按住拖动融合 · 双击分散';
  host.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  var width = 0, height = 0, droplets = [], hovered = null, dragged = null;
  var pointer = null, offset = { x: 0, y: 0 }, previous = 0, frame = null;
  var visible = true, nextId=0, stirring=null;
  var scene=null, sizeScale=1;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var colors = [[115,115,115]];
  function random(a, b) { return a + Math.random() * (b - a); }
  function gaussian() {
    return Math.sqrt(-2*Math.log(Math.max(1e-12,Math.random())))*Math.cos(2*Math.PI*Math.random());
  }
  function sceneSettings(w,h) {
    var count=Math.max(10,Math.min(50,Math.round(50*w*h/(1200*144))));
    return { count:count, stirBelow:Math.max(2,Math.round(count/10)), scale:Math.max(.5,Math.min(1,Math.sqrt(w/1200))) };
  }
  function motionScale(r) { return 34*sizeScale*Math.sqrt(8*sizeScale/Math.max(3*sizeScale,r)); }
  function radius(d) { return Math.sqrt(d.mass); }
  function fusionSize(a,b) {
    return Math.max(0,Math.min(1,(Math.sqrt(a.mass+b.mass)/sizeScale-8)/26));
  }
  function fusionProfile(a,b) {
    var ra=radius(a)/sizeScale, rb=radius(b)/sizeScale, small=Math.min(ra,rb), large=Math.max(ra,rb);
    var asymmetric=small/large<.65;
    // A tiny partner is absorbed quickly; two substantial drops relax more slowly.
    return { asymmetric:asymmetric, duration:asymmetric ? .1+.06*Math.min(1,small/12) : .1+.46*Math.max(0,Math.min(1,(small-7)/16)) };
  }
  function clamp(d) {
    var rx = Math.min(radius(d) + 2, width/2), ry = Math.min(radius(d) + 2, height/2);
    d.x = Math.max(rx, Math.min(width - rx, d.x));
    d.y = Math.max(ry, Math.min(height - ry, d.y));
  }
  function make(x, y, r, color) {
    return { x: x, y: y, mass: r*r, vx: gaussian()*motionScale(r), vy: gaussian()*motionScale(r), color: color, cooldown: 0,
      id:++nextId, seed: random(0,100), stress: 0, relax: 0,
      contact: null, mergeAngle: 0, manualBreak: null, rebound: .03, relaxDuration: .3 };
  }
  function resize() {
    var headerBox=header.getBoundingClientRect(), hostBox=host.getBoundingClientRect();
    var nav=host.querySelector('.site-nav'), navBox=nav ? nav.getBoundingClientRect() : null;
    var bottom=navBox && navBox.height>0 && !nav.classList.contains('is-open') ? navBox.bottom : headerBox.bottom;
    canvas.style.left=(headerBox.left-hostBox.left)+'px';
    canvas.style.top=(headerBox.top-hostBox.top)+'px';
    canvas.style.width=headerBox.width+'px';
    canvas.style.height=(bottom-headerBox.top)+'px';
    var bounds = canvas.getBoundingClientRect(), oldWidth = width, oldHeight = height;
    width = bounds.width; height = bounds.height;
    if (width<=0 || height<=0) return;
    var settings=sceneSettings(width,height);
    var reconfigure=!scene || settings.count!==scene.count || Math.abs(settings.scale-scene.scale)>.02;
    scene=settings;sizeScale=settings.scale;
    var scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.setTransform(scale,0,0,scale,0,0);
    if (reconfigure || !droplets.length) {
      droplets=[];dragged=null;hovered=null;pointer=null;stirring=null;
      for (var i=0; i<scene.count; i++) droplets.push(make(random(15,width-15), random(15,height-15), random(6,11)*sizeScale, colors[i%colors.length]));
    } else droplets.forEach(function (d) {
      if (oldWidth) d.x *= width/oldWidth;
      if (oldHeight) d.y *= height/oldHeight;
      clamp(d);
    });
    draw();
  }
  function pairAngle(a,b) {
    return Math.hypot(b.x-a.x,b.y-a.y)<1e-8 ? (a.id<b.id ? 0 : Math.PI) : Math.atan2(b.y-a.y,b.x-a.x);
  }
  function deformation(d) {
    var relaxation=Math.max(0,Math.min(1,d.relax/d.relaxDuration));
    var bounce=d.contact ? 0 : Math.sin((1-relaxation)*Math.PI*2)*relaxation*d.rebound;
    var squeeze=0;
    if (d.contact) {
      var partner=d.contact.partner;
      var progress=Math.sin(Math.min(1,d.contact.age/d.contact.duration)*Math.PI/2);
      // The smaller partner bears more deformation; equal drops share it equally.
      var small=Math.min(radius(d),radius(partner))/sizeScale;
      var strength=d.contact.asymmetric ? .018 : .025+.36*Math.max(0,Math.min(1,(small-9)/15));
      squeeze=progress*strength*radius(partner)/(radius(d)+radius(partner));
    }
    return 1+d.stress*.55+bounce-squeeze;
  }
  function dropShape(d) {
    var r=radius(d), sx=deformation(d);
    var angle=d.contact ? pairAngle(d,d.contact.partner) : d.stress>0 ? 0 : d.mergeAngle;
    var x=d.x,y=d.y;
    if (d.contact) {
      var partner=d.contact.partner, pr=radius(partner);
      var tx=(d.x*pr+partner.x*r)/(r+pr), ty=(d.y*pr+partner.y*r)/(r+pr);
      if (d.contact.asymmetric) {
        var big=r>=pr ? d : partner, little=big===d ? partner : d;
        var toward=pairAngle(big,little);
        tx=big.x+Math.cos(toward)*radius(big)*deformation(big);
        ty=big.y+Math.sin(toward)*radius(big)*deformation(big);
      }
      x=tx-Math.cos(angle)*r*sx;y=ty-Math.sin(angle)*r*sx;
    }
    var sy=Math.max(.2,Math.min(1/sx,(height/2-3)/r));
    return { d:d,x:x,y:y,angle:angle,sx:sx,sy:sy,rx:r*sx,ry:r*sy };
  }
  function separationPlane(a,b) {
    var dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    var nx=len>1e-8 ? dx/len : (a.d.id<b.d.id ? 1 : -1),ny=len>1e-8 ? dy/len : 0;
    function support(s) {
      var ca=Math.cos(s.angle),sa=Math.sin(s.angle);
      return Math.hypot(s.rx*(nx*ca+ny*sa),s.ry*(-nx*sa+ny*ca));
    }
    var ra=support(a),rb=support(b);
    return {nx:nx,ny:ny,c:nx*a.x+ny*a.y+len*ra/(ra+rb)};
  }
  function separationRegion(shape,shapes) {
    var polygon=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
    shapes.forEach(function (other) {
      if (other===shape || Math.hypot(other.x-shape.x,other.y-shape.y)>Math.max(shape.rx,shape.ry)+Math.max(other.rx,other.ry)+1) return;
      var plane=separationPlane(shape,other),result=[];
      for (var i=0;i<polygon.length;i++) {
        var a=polygon[i],b=polygon[(i+1)%polygon.length];
        var da=plane.nx*a.x+plane.ny*a.y-plane.c,db=plane.nx*b.x+plane.ny*b.y-plane.c;
        if (da<=0) result.push(a);
        if ((da<=0)!==(db<=0)) {
          var t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
        }
      }
      polygon=result;
    });
    return polygon;
  }
  function hit(p) {
    if (!p) return null;
    var shapes=droplets.map(dropShape);
    for (var i=droplets.length-1; i>=0; i--) {
      var d=droplets[i];
      var shape=dropShape(d),dx=p.x-shape.x,dy=p.y-shape.y,ca=Math.cos(shape.angle),sa=Math.sin(shape.angle);
      if (Math.pow((dx*ca+dy*sa)/shape.rx,2)+Math.pow((-dx*sa+dy*ca)/shape.ry,2)>1) continue;
      var covered=shapes.some(function (other) {
        if (other.d===d || Math.hypot(other.x-shape.x,other.y-shape.y)>Math.max(shape.rx,shape.ry)+Math.max(other.rx,other.ry)+1) return false;
        var plane=separationPlane(shape,other);
        return plane.nx*p.x+plane.ny*p.y>plane.c;
      });
      if (!covered) return d;
    }
    return null;
  }
  function split(d, forced, fragments) {
    if (d.contact) { d.contact.partner.contact=null; d.contact=null; }
    var count = fragments || 2;
    var r = Math.sqrt(d.mass/count), spread = (r+2)/Math.sin(Math.PI/count);
    droplets.splice(droplets.indexOf(d),1);
    if (hovered === d) hovered = null;
    if (dragged === d) dragged = null;
    for (var i=0; i<count; i++) {
      var angle = 2*Math.PI*i/count;
      var fragmentColor=colors[0].slice();
      var child = make(d.x+Math.cos(angle)*spread,d.y+Math.sin(angle)*spread,r,fragmentColor);
      child.vx = d.vx*.35 + Math.cos(angle)*32; child.vy = d.vy*.35 + Math.sin(angle)*20;
      child.relax = .8;
      // Cooldown only prevents repeated population-triggered breakup, not fusion.
      child.cooldown = 1.2; clamp(child); droplets.push(child);
    }
  }
  function resolveContacts() {
    for (var pass=0;pass<5;pass++) {
      for (var i=0;i<droplets.length;i++) for (var j=i+1;j<droplets.length;j++) {
        var a=droplets[i],b=droplets[j],distance=Math.hypot(b.x-a.x,b.y-a.y),overlap=radius(a)+radius(b)-distance;
        if (overlap<=0 || (a.contact && a.contact.partner===b)) continue;
        var angle=pairAngle(a,b),nx=Math.cos(angle),ny=Math.sin(angle);
        var shareA=b.mass/(a.mass+b.mass),shareB=1-shareA;
        if (a===dragged || a===hovered) { shareA=0;shareB=1; }
        else if (b===dragged || b===hovered) { shareA=1;shareB=0; }
        a.x-=nx*overlap*shareA;a.y-=ny*overlap*shareA;
        b.x+=nx*overlap*shareB;b.y+=ny*overlap*shareB;
        clamp(a);clamp(b);
      }
    }
  }
  function merge(dt) {
    dt=dt || 0;
    resolveContacts();
    for (var i=0; i<droplets.length; i++) {
      for (var j=i+1; j<droplets.length; j++) {
        var a=droplets[i], b=droplets[j];
        var distance=Math.hypot(a.x-b.x,a.y-b.y), limit=radius(a)+radius(b);
        if (a.contact && a.contact.partner===b && distance>limit+8) { a.contact=null;b.contact=null; }
        if (a.manualBreak || b.manualBreak || distance > limit+1) continue;
        if ((a.contact && a.contact.partner!==b) || (b.contact && b.contact.partner!==a)) continue;
        if (!a.contact) {
          var profile=fusionProfile(a,b), duration=profile.duration;
          a.contact={partner:b,age:0,duration:duration,asymmetric:profile.asymmetric};b.contact={partner:a,age:0,duration:duration,asymmetric:profile.asymmetric};
        }
        a.contact.age+=dt;b.contact.age=a.contact.age;
        if (a.contact.age < (reduced.matches ? 0 : a.contact.duration)) continue;
        // Keep the grabbed (or hovered) droplet as the merged object.
        var keep = b===dragged || (a!==dragged && b===hovered) ? b : a;
        var asymmetric=a.contact.asymmetric;
        if (asymmetric && a!==dragged && b!==dragged && a!==hovered && b!==hovered) keep=a.mass>=b.mass ? a : b;
        var other = keep===a ? b : a, mass=keep.mass+other.mass;
        if (keep!==dragged && keep!==hovered && !asymmetric) {
          keep.x=(keep.x*keep.mass+other.x*other.mass)/mass;
          keep.y=(keep.y*keep.mass+other.y*other.mass)/mass;
        }
        keep.color=keep.color.map(function (c,k) { return (c*keep.mass+other.color[k]*other.mass)/mass; });
        keep.vx=(keep.vx*keep.mass+other.vx*other.mass)/mass;
        keep.vy=(keep.vy*keep.mass+other.vy*other.mass)/mass;
        keep.mergeAngle=Math.atan2(b.y-a.y,b.x-a.x);
        var size=fusionSize(a,b);
        keep.rebound=asymmetric ? .015 : .015+.145*Math.max(0,Math.min(1,(Math.min(radius(a),radius(b))/sizeScale-9)/15));
        keep.relaxDuration=.25+.5*size;
        keep.mass=mass; keep.relax=keep.relaxDuration; keep.contact=null; other.contact=null; clamp(keep);
        // Random thermal kicks resume naturally after fusion, without forced drift.
        droplets.splice(droplets.indexOf(other),1);
        return merge(0);
      }
    }
  }
  function update(dt) {
    if (!stirring && scene && droplets.length<scene.stirBelow && !dragged && !droplets.some(function (d) { return d.manualBreak; })) {
      stirring={age:0};
      droplets.forEach(function (d) { d.contact=null;d.stress=0;d.relax=0; });
    }
    if (stirring) stirring.age+=dt;
    droplets.forEach(function (d) {
      d.cooldown=Math.max(0,d.cooldown-dt);
      if (d.manualBreak) {
        d.manualBreak.age+=dt;
        d.stress=Math.min(1,d.manualBreak.age/.6);
        return;
      }
      d.relax=Math.max(0,d.relax-dt);
      if (d===dragged || d===hovered) return;
      if (!reduced.matches) {
        // Short-correlated random motion: isotropic, no preferred direction.
        // Size-dependent variance gives larger droplets slower apparent diffusion.
        var decay=Math.exp(-dt/.14);
        var kick=motionScale(radius(d))*Math.sqrt(1-decay*decay);
        d.vx=d.vx*decay+gaussian()*kick;
        d.vy=d.vy*decay+gaussian()*kick;
        if (stirring) {
          var dx=d.x-width/2,dy=d.y-height/2;
          var flow=Math.sin(Math.min(1,stirring.age/1.4)*Math.PI);
          d.vx+=(-dy*3-dx*.12)*flow*dt*7;
          d.vy+=(dx*.12-dy*.4)*flow*dt*7;
        }
        if (!d.contact) { d.x+=d.vx*dt; d.y+=d.vy*dt; }
        var rx=Math.min(radius(d)+2,width/2), ry=Math.min(radius(d)+2,height/2);
        if (d.x<rx || d.x>width-rx) d.vx*=-1;
        if (d.y<ry || d.y>height-ry) d.vy*=-1;
        clamp(d);
      }
    });
    if (!stirring) merge(dt);
    if (stirring && (stirring.age>=1.4 || reduced.matches) && !dragged) {
      var parents=droplets.slice();
      parents.forEach(function (d) { split(d,false,Math.max(2,Math.ceil(d.mass/(64*sizeScale*sizeScale)))); });
      // Redistribute the fragments throughout the solution, avoiding initial overlap.
      var placed=[];
      droplets.forEach(function (d) {
        var r=radius(d),best=null,bestGap=-Infinity;
        for (var trial=0;trial<60;trial++) {
          var candidate={x:random(r+2,width-r-2),y:random(r+2,height-r-2)};
          var gap=placed.reduce(function (g,p) { return Math.min(g,Math.hypot(candidate.x-p.x,candidate.y-p.y)-r-radius(p)); },Infinity);
          if (gap>bestGap) { best=candidate;bestGap=gap; }
          if (gap>2) break;
        }
        d.x=best.x;d.y=best.y;d.relax=0;placed.push(d);
      });
      stirring=null;
    }
    droplets.slice().forEach(function (d) {
      if (d.manualBreak && d.stress>=1) split(d,true);
    });
    if (!dragged) hovered=hit(pointer);
    canvas.style.cursor=dragged ? 'grabbing' : hovered ? 'grab' : 'default';
  }
  function draw() {
    // Clear every physical pixel, including the rounded edge at fractional DPI.
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.restore();
    // A pale continuous aqueous phase, with sparse solutes outside the dense drops.
    var water=ctx.createLinearGradient(0,height,width,0);
    water.addColorStop(0,'rgba(225,241,243,.04)');
    water.addColorStop(.4,'rgba(225,241,243,.12)');
    water.addColorStop(1,'rgba(209,235,238,.4)');
    ctx.fillStyle=water; ctx.fillRect(0,0,width,height);
    if (stirring && !reduced.matches) {
      ctx.save();ctx.translate(width/2,height/2);ctx.scale(1,.22);
      for (var ring=0;ring<4;ring++) {
        ctx.beginPath();ctx.arc(0,0,60+ring*65,stirring.age*3+ring,stirring.age*3+ring+Math.PI*.85);
        ctx.strokeStyle='rgba(41,151,140,.12)';ctx.lineWidth=1.4;ctx.stroke();
      }
      ctx.restore();
    }
    for (var k=0;k<28;k++) {
      var px=((k*.61803398875)%1)*width, py=(.15+((k*.41421356237)%1)*.7)*height;
      ctx.beginPath();ctx.arc(px,py,.65,0,Math.PI*2);ctx.fillStyle='rgba(72,127,142,.13)';ctx.fill();
    }
    var shapes=droplets.map(dropShape);
    droplets.forEach(function (d,index) {
      var shape=shapes[index], r=radius(d), c=d.color.map(Math.round).join(',');
      var region=separationRegion(shape,shapes);
      ctx.save();ctx.beginPath();
      region.forEach(function (p,i) { if (i) ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y); });
      ctx.closePath();ctx.clip();
      ctx.translate(shape.x,shape.y);ctx.rotate(shape.angle);ctx.scale(shape.sx,shape.sy);
      // Dense interior and diffuse interface, without a bubble rim or white glint.
      var fill=ctx.createRadialGradient(0,0,0,0,0,r);
      fill.addColorStop(0,'rgba('+c+',.52)');fill.addColorStop(.78,'rgba('+c+',.47)');fill.addColorStop(1,'rgba('+c+',.24)');
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
      ctx.strokeStyle='rgba('+c+',.25)';ctx.lineWidth=.65;ctx.stroke();
      var dots=Math.max(6,Math.round(d.mass/13));
      for (var n=0;n<dots;n++) {
        var angle=n*2.39996+d.seed, distance=r*.83*Math.sqrt((n+.5)/dots);
        ctx.beginPath();ctx.arc(Math.cos(angle)*distance,Math.sin(angle)*distance,.6,0,Math.PI*2);
        ctx.fillStyle='rgba('+c+',.25)';ctx.fill();
      }
      ctx.restore();
    });
    // Keep the logo and navigation visually quiet while droplets move behind them.
    var logoFade=ctx.createLinearGradient(0,0,width*.5,0);
    logoFade.addColorStop(0,'rgba(255,255,255,.6)');
    logoFade.addColorStop(.55,'rgba(255,255,255,.42)');
    logoFade.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=logoFade;ctx.fillRect(0,0,width,height);
    var navElement=host.querySelector('.site-nav');
    var navHeight=navElement && !navElement.classList.contains('is-open') ? navElement.getBoundingClientRect().height : 0;
    if (navHeight>0) {
      var navFade=ctx.createLinearGradient(0,Math.max(0,height-navHeight-32),0,height);
      navFade.addColorStop(0,'rgba(255,255,255,0)');
      navFade.addColorStop(.45,'rgba(255,255,255,.4)');
      navFade.addColorStop(1,'rgba(255,255,255,.62)');
      ctx.fillStyle=navFade;ctx.fillRect(0,Math.max(0,height-navHeight-32),width,navHeight+32);
    }
  }
  function tick(now) {
    frame=null;
    if (!visible || document.hidden) { previous=0; return; }
    var dt=previous ? Math.min((now-previous)/1000,.04) : 0;
    previous=now;
    if (width && height) { update(dt); draw(); }
    frame=window.requestAnimationFrame(tick);
  }
  function resume() {
    if (visible && !document.hidden && frame===null) { previous=0; frame=window.requestAnimationFrame(tick); }
  }
  function position(event) {
    var bounds=canvas.getBoundingClientRect(); return {x:event.clientX-bounds.left,y:event.clientY-bounds.top};
  }
  canvas.addEventListener('pointermove',function (event) {
    pointer=position(event);
    if (dragged) {
      dragged.x=pointer.x-offset.x; dragged.y=pointer.y-offset.y; clamp(dragged);
      merge(); draw();
    } else hovered=hit(pointer);
  });
  canvas.addEventListener('pointerleave',function () { if (!dragged) { pointer=null; hovered=null; } });
  canvas.addEventListener('pointerdown',function (event) {
    if (event.button!==0) return;
    pointer=position(event); dragged=hit(pointer);
    if (!dragged) return;
    event.preventDefault(); hovered=dragged;
    offset={x:pointer.x-dragged.x,y:pointer.y-dragged.y};
    canvas.setPointerCapture(event.pointerId);
  });
  function release(event) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    dragged=null;
    pointer=event.type==='pointercancel' ? null : position(event);
    hovered=hit(pointer);
  }
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',function () { dragged=null; });
  canvas.addEventListener('dblclick',function (event) {
    var d=hit(position(event));
    if (d) {
      event.preventDefault();
      if (reduced.matches) split(d,true);
      else {
        if (d.contact) { d.contact.partner.contact=null;d.contact=null; }
        d.manualBreak={age:0}; d.stress=0;d.relax=0;
      }
      draw();
    }
  });
  window.addEventListener('blur',function () { dragged=null; hovered=null; pointer=null; });
  document.addEventListener('visibilitychange',resume);
  if (window.ResizeObserver) {
    var sizing=new ResizeObserver(resize);sizing.observe(host);sizing.observe(header);
    var logo=header.querySelector('.site-brand');if (logo) sizing.observe(logo);
  }
  else window.addEventListener('resize',resize);
  if (window.IntersectionObserver) new IntersectionObserver(function (entries) {
    visible=entries[0].isIntersecting; resume();
  }).observe(canvas);
  resize(); resume();
}());
