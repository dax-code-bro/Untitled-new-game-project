import * as THREE from "three";

export function createLevel(scene: THREE.Scene) {
  // Lighting
  const ambient = new THREE.AmbientLight(0x2a1a0a, 0.6);
  scene.add(ambient);

  const moonLight = new THREE.DirectionalLight(0x4466aa, 0.8);
  moonLight.position.set(-10, 30, -10);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.far = 120;
  moonLight.shadow.camera.left = -60;
  moonLight.shadow.camera.right = 60;
  moonLight.shadow.camera.top = 60;
  moonLight.shadow.camera.bottom = -60;
  scene.add(moonLight);

  // Torches (warm point lights scattered around)
  const torchPositions = [
    [-8, 2, -15], [8, 2, -15], [-8, 2, 15], [8, 2, 15],
    [-20, 2, 0], [20, 2, 0], [0, 2, -25], [0, 2, 25],
  ];
  torchPositions.forEach(([x, y, z]) => {
    const light = new THREE.PointLight(0xff6600, 1.2, 12);
    light.position.set(x, y, z);
    scene.add(light);
    // Torch mesh
    const torch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a1a })
    );
    torch.position.set(x, y - 0.3, z);
    scene.add(torch);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8800 })
    );
    flame.position.set(x, y + 0.05, z);
    scene.add(flame);
  });

  // Ground — muddy WW2 battlefield
  const groundGeo = new THREE.PlaneGeometry(120, 120, 30, 30);
  const positions = groundGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    if (Math.abs(x) > 3 || Math.abs(z) > 3) {
      positions.setY(i, (Math.random() - 0.5) * 0.3 + Math.sin(x * 0.2) * 0.1);
    }
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d1f0e, roughness: 1.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Starting bunker
  buildBunker(scene);

  // Trenches
  buildTrenches(scene);

  // Barbed wire, sandbags, debris
  buildProps(scene);

  // Skybox (dark wartime sky)
  buildSky(scene);

  // Stars
  buildStars(scene);
}

function buildBunker(scene: THREE.Scene) {
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x4a4a3a, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });

  // Bunker walls
  const walls = [
    { size: [8, 3, 0.4], pos: [0, 1.5, -4] },
    { size: [8, 3, 0.4], pos: [0, 1.5, 4] },
    { size: [0.4, 3, 8], pos: [-4, 1.5, 0] },
    { size: [0.4, 3, 8], pos: [4, 1.5, 0] },
  ] as const;
  walls.forEach(({ size, pos }) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), concreteMat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // Ceiling with opening (balcony)
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 5), concreteMat);
  ceiling.position.set(0, 3, -1.5);
  scene.add(ceiling);

  // Balcony rail
  const rail = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 0.15), woodMat);
  rail.position.set(0, 3.4, -4);
  scene.add(rail);
  const railPost1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), woodMat);
  railPost1.position.set(-3.8, 3.4, -4);
  scene.add(railPost1);
  const railPost2 = railPost1.clone();
  railPost2.position.set(3.8, 3.4, -4);
  scene.add(railPost2);

  // Star marker on floor
  buildStarMarker(scene, new THREE.Vector3(0, 0.01, -3));

  // Ammo crates inside
  [-1.5, 1.5].forEach(x => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.4), woodMat);
    crate.position.set(x, 0.25, 2.5);
    crate.castShadow = true;
    scene.add(crate);
    // Crate lines
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a1a0a }));
    line.position.set(x, 0.4, 2.5);
    scene.add(line);
  });
}

function buildStarMarker(scene: THREE.Scene, pos: THREE.Vector3) {
  // Glowing star on floor to indicate objective
  const starGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.02, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffdd00 })
    );
    bar.rotation.y = angle;
    starGroup.add(bar);
  }
  starGroup.position.copy(pos);
  scene.add(starGroup);

  // Glow light
  const glow = new THREE.PointLight(0xffdd00, 0.8, 3);
  glow.position.copy(pos);
  glow.position.y += 0.5;
  scene.add(glow);

  // Pulse animation stored on userData
  starGroup.userData.pulse = true;
}

function buildTrenches(scene: THREE.Scene) {
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x3d2b12, roughness: 1.0 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });

  // Main trench running from bunker exit south
  const trenchSegments = [
    { pos: [0, -0.5, -12], size: [3, 2, 16] },   // front trench
    { pos: [-10, -0.5, -22], size: [16, 2, 3] },  // left branch
    { pos: [10, -0.5, -22], size: [3, 2, 3] },    // right turn
    { pos: [10, -0.5, -32], size: [3, 2, 20] },   // right path to facility
  ];

  trenchSegments.forEach(({ pos, size }) => {
    // Trench walls (sides)
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.5, size[1], 0.3), dirtMat);
    wall1.position.set(pos[0], pos[1] + 0.5, pos[2] - size[2] / 2);
    scene.add(wall1);
    const wall2 = wall1.clone();
    wall2.position.z = pos[2] + size[2] / 2;
    scene.add(wall2);

    // Trench floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.2, size[2]), dirtMat);
    floor.position.set(pos[0], pos[1], pos[2]);
    floor.receiveShadow = true;
    scene.add(floor);

    // Wood planks on floor
    for (let j = 0; j < Math.floor(size[2] / 1.5); j++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(size[0] - 0.2, 0.06, 0.3), woodMat);
      plank.position.set(pos[0], pos[1] + 0.11, pos[2] - size[2] / 2 + j * 1.5 + 0.5);
      scene.add(plank);
    }
  });

  // Buyable door 1 (700 pts)
  buildDoor(scene, new THREE.Vector3(0, 0, -4.5), "700 pts", 0x8b6914);
  // Buyable door 2 (2000 pts) at right turn
  buildDoor(scene, new THREE.Vector3(10, 0, -21), "2000 pts", 0x8b6914);
}

function buildDoor(scene: THREE.Scene, pos: THREE.Vector3, label: string, color: number) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 1.6), mat);
  frame.position.copy(pos);
  frame.position.x -= 0.8;
  scene.add(frame);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 1.4), new THREE.MeshStandardMaterial({ color: 0x5a3a10, roughness: 0.9 }));
  door.position.copy(pos);
  scene.add(door);

  // Price sign (simple box with emissive)
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.3, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.5 })
  );
  sign.position.set(pos.x + 0.15, pos.y + 1.5, pos.z);
  scene.add(sign);

  void label; // Will be replaced with proper text rendering later
}

function buildProps(scene: THREE.Scene) {
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 1.0 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 });

  // Sandbag clusters
  const sandbagPositions = [
    [-5, -2], [5, -2], [-6, 5], [6, 5],
    [-3, -8], [3, -8], [-15, -20], [15, -20],
  ];
  sandbagPositions.forEach(([x, z]) => {
    for (let i = 0; i < 3; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), sandbagMat);
      bag.position.set(x + (Math.random() - 0.5) * 0.4, 0.12 + i * 0.24, z + (Math.random() - 0.5) * 0.3);
      bag.rotation.y = Math.random() * 0.5;
      bag.castShadow = true;
      scene.add(bag);
    }
  });

  // Barbed wire posts
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const r = 18 + Math.random() * 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), metalMat);
    post.position.set(Math.cos(angle) * r, 0.6, Math.sin(angle) * r);
    post.castShadow = true;
    scene.add(post);
  }

  // Craters
  for (let i = 0; i < 8; i++) {
    const craterGeo = new THREE.CircleGeometry(0.8 + Math.random() * 1.2, 12);
    const crater = new THREE.Mesh(craterGeo, new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 1.0 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(
      (Math.random() - 0.5) * 40,
      0.01,
      -8 - Math.random() * 30
    );
    scene.add(crater);
  }

  // Destroyed tank hulk
  const tankBody = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 5), metalMat);
  tankBody.position.set(-15, 0.5, -18);
  tankBody.rotation.y = 0.4;
  tankBody.castShadow = true;
  scene.add(tankBody);
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.5), metalMat);
  turret.position.set(-15, 1.35, -18);
  turret.rotation.y = 0.9;
  scene.add(turret);
}

function buildSky(scene: THREE.Scene) {
  // Dark overcast sky dome
  const skyGeo = new THREE.SphereGeometry(90, 16, 8);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x050810, side: THREE.BackSide });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Moon
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xddddcc })
  );
  moon.position.set(-30, 55, -60);
  scene.add(moon);

  // Moon glow
  const moonGlow = new THREE.PointLight(0x8899cc, 0.5, 200);
  moonGlow.position.copy(moon.position);
  scene.add(moonGlow);
}

function buildStars(scene: THREE.Scene) {
  const starGeo = new THREE.BufferGeometry();
  const positions: number[] = [];
  for (let i = 0; i < 800; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 85;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      Math.abs(r * Math.cos(phi)) + 10,
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 }));
  scene.add(stars);
}
