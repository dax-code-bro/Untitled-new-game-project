-- Live-edited while the game runs. No compile step.
-- Mirrors the values currently hard-coded in the JS engine so the port
-- can be compared against it number for number.
return {
  player = { walk = 4.2, sprint = 7.1, crouch = 2.0, jump = 5.4 },
  camera = { fov = 62, near = 0.05, far = 400 },
  sun    = { dir = {0.45, 0.72, 0.53}, intensity = 3.4,
             color = {1.0, 0.94, 0.84} },
  -- The five tiers the JS renderer ships, same keys, same meanings.
  quality = {
    ultra = { renderScale = 1.85, shadowRes = 4096, ssr = 1, envScene = 1,
              pcss = 1, parallax = 1, volumetric = 1 },
    high  = { renderScale = 1.25, shadowRes = 4096, ssr = 0, envScene = 0,
              pcss = 0, parallax = 0, volumetric = 0 },
  },
}
