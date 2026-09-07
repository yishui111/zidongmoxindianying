/* =====================================================================
 * Astra 场景装载器 [L1] —— 读 scenes/<id>/scene.json 并装配整个世界
 * 新增场景 = 新建文件夹 + scene.json + 在 scenes/manifest.json 加一行
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const SL = {};

  A.define({
    id: 'sceneLoader', layer: 1, deps: ['engine', 'world', 'props', 'landmarks'],
    setup: function () { return SL; }
  });

  SL.list = function () {
    return fetch('scenes/manifest.json').then(function (r) { return r.json(); });
  };

  SL.load = function (id) {
    return fetch('scenes/' + id + '/scene.json').then(function (r) { return r.json(); });
  };

  /* 装配：地形 → 海面 → 植被 → 地标，返回运行时世界对象 */
  SL.apply = function (cfg) {
    const scene = A.engine.scene;
    const T = cfg.terrain;
    const heightAt = A.world.makeHeightFn(T);
    const terrain = A.world.buildTerrain(heightAt, T, cfg.palette);
    scene.add(terrain);
    const sea = A.world.buildSea(T, cfg.palette);
    scene.add(sea.mesh);

    /* 落点避让区：祭坛 / 鸟居 / 出生点 */
    const LM = cfg.landmarks || {};
    const clear = [];
    if (LM.altar) clear.push({ x: LM.altar.x, z: LM.altar.z, r: 26 });
    if (LM.torii) clear.push({ x: LM.torii.x, z: LM.torii.z, r: 8 });
    if (cfg.spawn) clear.push({ x: cfg.spawn.x, z: cfg.spawn.z, r: 10 });

    const spots = {
      trees: A.world.sampleSpots(cfg.vegetation.trees, heightAt,
        { seed: T.seed + 1, minH: 1.6, maxH: 20, maxSlope: 2.6, radius: T.size * 0.42, keepClear: clear }),
      rocks: A.world.sampleSpots(cfg.vegetation.rocks, heightAt,
        { seed: T.seed + 2, minH: 0.8, maxH: 27, maxSlope: 3.4, radius: T.size * 0.42, keepClear: clear }),
      grass: A.world.sampleSpots(cfg.vegetation.grass, heightAt,
        { seed: T.seed + 3, minH: 1.2, maxH: 18, maxSlope: 2.2, radius: T.size * 0.42, keepClear: clear }),
      flowers: A.world.sampleSpots(cfg.vegetation.flowers, heightAt,
        { seed: T.seed + 4, minH: 1.4, maxH: 15, maxSlope: 1.8, radius: T.size * 0.42, keepClear: clear })
    };
    A.props.build(heightAt, cfg, cfg.palette, spots);
    const lm = A.landmarks.build(heightAt, cfg);

    A.world.cfg = cfg;
    A.world.heightAt = heightAt;
    A.world.seaLevel = T.seaLevel || 0;
    A.world.spawn = cfg.spawn || { x: 0, z: 24 };
    A.world.altar = lm.altar;
    A.world.beam = lm.beam;
    A.world.pedestal = lm.pedestal;
    A.world.lamps = lm.lamps;
    A.world.update = function (dt, t) { sea.update(t); if (lm.pedestal) { lm.pedestal.rotation.y += dt * 0.8; lm.pedestal.position.y = 2.0 + Math.sin(t * 1.8) * 0.12; } };

    return A.world;
  };

  A.sceneLoader = SL;
})();
