import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/** CC0 Quaternius SWAT. Provenance accompanies /assets/characters/swat.glb. */
export const ACTOR_ASSET_URL = '/assets/characters/swat.glb';
export const ACTOR_HEIGHT = 1.75;

export interface ActorPose {
  x: number;
  y: number;
  z: number;
  /** Same convention as simulation/camera: zero looks down -Z. */
  yaw: number;
  /** Positive pitch looks up. */
  pitch: number;
  /** Actual horizontal displacement per second, not requested movement. */
  speed: number;
  shooting: boolean;
  dead: boolean;
  reloading?: boolean;
  weapon?: 'rifle' | 'pistol';
}

type Motion = 'idle' | 'walk' | 'run' | 'aim' | 'fire' | 'reload' | 'death';

export interface Actor {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** Useful for verification and optional UI; no physics depends on it. */
  animationState: 'idle' | 'walk' | 'run' | 'fire' | 'reload' | 'death';
  mixer: THREE.AnimationMixer;
  model: THREE.Object3D;
  actions: Record<Motion, THREE.AnimationAction>;
  weaponMount: THREE.Group;
  weapons: Record<'rifle' | 'pistol', THREE.Group>;
  flash: THREE.Mesh;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  arms: { right: THREE.Object3D[]; left: THREE.Object3D[] };
  proceduralBones: { bone: THREE.Object3D; animatedRotation: THREE.Quaternion }[];
  materials: THREE.Material[];
  dead: boolean;
  age: number;
}

let asset: GLTF | undefined;
let assetPromise: Promise<void> | undefined;
const UP = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const pitchRotation = new THREE.Quaternion();
const armVectors = Array.from({ length: 9 }, () => new THREE.Vector3());
const armQuaternions = Array.from({ length: 4 }, () => new THREE.Quaternion());
const gripTarget = new THREE.Vector3();
const elbowPole = new THREE.Vector3();

/** Two-bone IK keeps the rifle shouldered and the support hand on the fore-end. */
function placeArm(chain: THREE.Object3D[], target: THREE.Vector3, pole: THREE.Vector3) {
  const [upper, lower, wrist] = chain;
  const [shoulder, elbow, hand, direction, plane, joint, from, to, origin] = armVectors;
  upper.getWorldPosition(shoulder);
  lower.getWorldPosition(elbow);
  wrist.getWorldPosition(hand);
  const upperLength = shoulder.distanceTo(elbow);
  const lowerLength = elbow.distanceTo(hand);
  const distance = THREE.MathUtils.clamp(shoulder.distanceTo(target), 0.03, upperLength + lowerLength - 0.001);
  direction.subVectors(target, shoulder).normalize();
  plane.copy(pole).addScaledVector(direction, -pole.dot(direction)).normalize();
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  joint.copy(shoulder).addScaledVector(direction, along).addScaledVector(plane, height);
  const [rotation, world, parent, handRotation] = armQuaternions;
  wrist.getWorldQuaternion(handRotation);
  from.subVectors(elbow, shoulder).normalize();
  to.subVectors(joint, shoulder).normalize();
  rotation.setFromUnitVectors(from, to);
  upper.getWorldQuaternion(world).premultiply(rotation);
  upper.parent!.getWorldQuaternion(parent).invert();
  upper.quaternion.copy(parent.multiply(world));
  upper.updateWorldMatrix(false, true);
  lower.getWorldPosition(origin);
  wrist.getWorldPosition(hand);
  from.subVectors(hand, origin).normalize();
  to.subVectors(target, origin).normalize();
  rotation.setFromUnitVectors(from, to);
  lower.getWorldQuaternion(world).premultiply(rotation);
  lower.parent!.getWorldQuaternion(parent).invert();
  lower.quaternion.copy(parent.multiply(world));
  lower.updateWorldMatrix(false, true);
  wrist.parent!.getWorldQuaternion(parent).invert();
  wrist.quaternion.copy(parent.multiply(handRotation));
  wrist.updateWorldMatrix(false, true);
}

/** Load once before creating actors. Failure rejects so the client can show retry UI. */
export function loadActorAsset(): Promise<void> {
  if (asset) return Promise.resolve();
  if (!assetPromise) {
    assetPromise = new GLTFLoader().loadAsync(ACTOR_ASSET_URL).then((loaded) => {
      for (const name of ['Idle_Gun_Pointing', 'Walk', 'Run', 'Idle_Gun_Shoot', 'Interact', 'Death']) {
        if (!loaded.animations.some((clip) => clip.name === name)) throw new Error(`Character animation is missing: ${name}`);
      }
      if (!loaded.scene.getObjectByName('WristR')) throw new Error('Character hand rig is missing.');
      asset = loaded;
    }).catch((error: unknown) => {
      assetPromise = undefined;
      throw error;
    });
  }
  return assetPromise;
}

function meshBox(group: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

/** Original lightweight geometry; +Z is barrel direction and origin is grip. */
function makeWeapon(kind: 'rifle' | 'pistol', dark: THREE.Material, metal: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'rifle') {
    meshBox(group, [0.07, 0.09, 0.30], [0, 0.09, 0.12], dark);
    meshBox(group, [0.06, 0.06, 0.24], [0, 0.10, 0.38], dark);
    meshBox(group, [0.023, 0.023, 0.19], [0, 0.10, 0.57], metal);
    meshBox(group, [0.07, 0.11, 0.17], [0, 0.055, -0.17], dark);
    meshBox(group, [0.045, 0.12, 0.065], [0, -0.015, 0.14], dark).rotation.x = -0.13;
    meshBox(group, [0.046, 0.11, 0.055], [0, -0.025, -0.005], dark).rotation.x = 0.18;
    meshBox(group, [0.025, 0.03, 0.07], [0, 0.15, 0.08], metal);
    meshBox(group, [0.012, 0.05, 0.025], [0, 0.135, 0.49], metal);
  } else {
    meshBox(group, [0.055, 0.07, 0.23], [0, 0.075, 0.07], metal);
    meshBox(group, [0.05, 0.11, 0.065], [0, -0.008, -0.01], dark).rotation.x = 0.16;
    meshBox(group, [0.015, 0.018, 0.025], [0, 0.117, 0.14], dark);
  }
  return group;
}

/** Call only after loadActorAsset resolves. Each actor has an independent skeleton. */
export function createActor(team: 'blue' | 'orange'): Actor {
  if (!asset) throw new Error('Load the character asset before creating actors.');
  const model = cloneSkeleton(asset.scene);
  const group = new THREE.Group();
  group.name = `actor-${team}`;
  group.add(model);

  const materials: THREE.Material[] = [];
  const materialCopies = new Map<THREE.Material, THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // Skinning moves limbs outside the bind-pose bounding sphere.
    object.frustumCulled = false;
    const copy = (original: THREE.Material): THREE.Material => {
      const existing = materialCopies.get(original);
      if (existing) return existing;
      const material = original.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = 0.86;
        if (material.name === 'Swat') material.color.set(team === 'blue' ? '#456581' : '#986345');
      }
      materialCopies.set(original, material);
      materials.push(material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
  });

  const mixer = new THREE.AnimationMixer(model);
  const all = new Map(asset.animations.map((clip) => [clip.name, clip]));
  // Separate upper-body aiming from the legs so the weapon stays in the hand
  // while idle/walk/run crossfade, rather than swinging like an unarmed walk.
  const upperBones = new Set<string>();
  model.getObjectByName('Abdomen')!.traverse((bone) => upperBones.add(bone.name));
  function action(name: string, layer?: 'upper' | 'lower') {
    const original = all.get(name)!;
    const clip = layer ? new THREE.AnimationClip(`${name}-${layer}`, original.duration, original.tracks.filter((track) => {
      const upper = upperBones.has(track.name.slice(0, track.name.indexOf('.')));
      return layer === 'upper' ? upper : !upper;
    })) : original;
    return mixer.clipAction(clip);
  }
  const actions = {
    idle: action('Idle_Gun_Pointing', 'lower'),
    walk: action('Walk', 'lower'),
    run: action('Run', 'lower'),
    aim: action('Idle_Gun_Pointing', 'upper'),
    fire: action('Idle_Gun_Shoot', 'upper'),
    reload: action('Interact', 'upper'),
    death: action('Death'),
  };
  for (const [name, motion] of Object.entries(actions)) {
    if (name === 'death') continue;
    motion.play().setEffectiveWeight(name === 'idle' || name === 'aim' ? 1 : 0);
  }
  mixer.update(0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = ACTOR_HEIGHT / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.y = -bounds.min.y * scale;

  // The source pistol is skinned to the wrist. Replace its geometry with our
  // compact weapon so rifle/pistol silhouettes match the active weapon.
  const originalPistol = model.getObjectByName('Pistol');
  if (originalPistol) originalPistol.visible = false;
  const weaponMount = new THREE.Group();
  weaponMount.name = 'weapon-in-right-hand';
  // Quaternius hand axes: +Y follows the fingers, -X points up, -Z right.
  weaponMount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), UP,
  ));
  weaponMount.position.set(-0.025, 0.065, 0.005);
  model.getObjectByName('WristR')!.add(weaponMount);
  const dark = new THREE.MeshStandardMaterial({ color: '#20272a', roughness: 0.77, metalness: 0.18 });
  const metal = new THREE.MeshStandardMaterial({ color: '#444d51', roughness: 0.48, metalness: 0.7 });
  materials.push(dark, metal);
  const weapons = { rifle: makeWeapon('rifle', dark, metal), pistol: makeWeapon('pistol', dark, metal) };
  weaponMount.add(weapons.rifle, weapons.pistol);
  weapons.pistol.visible = false;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.1, 0.68);
  weaponMount.add(muzzle);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffe49c', transparent: true, opacity: 0.85, depthWrite: false });
  materials.push(flashMaterial);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), flashMaterial);
  flash.rotation.x = Math.PI / 2;
  flash.position.z = 0.06;
  flash.visible = false;
  muzzle.add(flash);

  return {
    group, muzzle, model, mixer, actions, weaponMount, weapons, flash,
    chest: model.getObjectByName('Chest')!, head: model.getObjectByName('Head')!,
    arms: {
      right: ['UpperArmR', 'LowerArmR', 'WristR'].map((name) => model.getObjectByName(name)!),
      left: ['UpperArmL', 'LowerArmL', 'WristL'].map((name) => model.getObjectByName(name)!),
    },
    proceduralBones: ['Chest', 'Head', 'UpperArmR', 'LowerArmR', 'WristR', 'UpperArmL', 'LowerArmL', 'WristL'].map((name) => {
      const bone = model.getObjectByName(name)!;
      return { bone, animatedRotation: bone.quaternion.clone() };
    }),
    materials, animationState: 'idle', dead: false, age: 0,
  };
}

/** Render-only animation. Position and combat remain controlled by simulation. */
export function updateActor(actor: Actor, pose: ActorPose, deltaSeconds: number): void {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
  actor.age += dt;
  // AnimationMixer skips writes for unchanged keyed values. Restore the last
  // authored pose before evaluation so procedural offsets never accumulate.
  for (const entry of actor.proceduralBones) entry.bone.quaternion.copy(entry.animatedRotation);
  actor.group.position.set(pose.x, pose.y, pose.z);
  actor.group.rotation.y = pose.yaw + Math.PI; // source faces +Z, game faces -Z

  if (pose.dead !== actor.dead) {
    actor.dead = pose.dead;
    if (pose.dead) {
      for (const [name, action] of Object.entries(actor.actions)) if (name !== 'death') action.fadeOut(0.12);
      actor.actions.death.reset().setEffectiveWeight(1).setLoop(THREE.LoopOnce, 1).play();
      actor.actions.death.clampWhenFinished = true;
    } else {
      actor.actions.death.stop();
      for (const [name, action] of Object.entries(actor.actions)) {
        if (name !== 'death') action.reset().stopFading().play().setEffectiveWeight(name === 'idle' || name === 'aim' ? 1 : 0);
      }
    }
  }

  if (pose.dead) {
    actor.animationState = 'death';
    actor.flash.visible = false;
    actor.mixer.update(dt);
    for (const entry of actor.proceduralBones) entry.animatedRotation.copy(entry.bone.quaternion);
    return;
  }

  const speed = Math.max(0, pose.speed);
  const walking = THREE.MathUtils.clamp(speed / 0.7, 0, 1);
  const running = THREE.MathUtils.smoothstep(speed, 1.8, 3.4);
  const weights: Record<Exclude<Motion, 'death'>, number> = {
    idle: 1 - walking,
    walk: walking * (1 - running),
    run: walking * running,
    aim: pose.reloading || pose.shooting ? 0 : 1,
    fire: pose.shooting && !pose.reloading ? 1 : 0,
    reload: pose.reloading ? 1 : 0,
  };
  const blend = 1 - Math.exp(-dt * 13);
  for (const [name, weight] of Object.entries(weights)) {
    const action = actor.actions[name as Exclude<Motion, 'death'>];
    action.setEffectiveWeight(THREE.MathUtils.lerp(action.getEffectiveWeight(), weight, blend));
  }
  actor.actions.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.7, 0.65, 1.8));
  actor.actions.run.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 3.5, 0.65, 1.65));
  actor.mixer.update(dt);
  for (const entry of actor.proceduralBones) entry.animatedRotation.copy(entry.bone.quaternion);

  // Pitch and hand placement are applied after skeletal animation evaluation.
  const pitch = THREE.MathUtils.clamp(pose.pitch, -0.8, 0.8);
  actor.chest.quaternion.multiply(pitchRotation.setFromAxisAngle(PITCH_AXIS, -pitch * 0.65));
  actor.head.quaternion.multiply(pitchRotation.setFromAxisAngle(PITCH_AXIS, -pitch * 0.3));
  const weapon = pose.weapon ?? 'rifle';
  if (weapon === 'rifle' && !pose.reloading) {
    actor.model.updateWorldMatrix(true, true);
    actor.chest.localToWorld(gripTarget.set(-0.16, 0.015, 0.22));
    elbowPole.set(-1, -0.8, 0).transformDirection(actor.model.matrixWorld);
    placeArm(actor.arms.right, gripTarget, elbowPole);
    actor.weaponMount.localToWorld(gripTarget.set(0.025, -0.025, 0.28));
    elbowPole.set(1, -0.8, 0).transformDirection(actor.model.matrixWorld);
    placeArm(actor.arms.left, gripTarget, elbowPole);
    // Turn the support palm into the fore-end instead of retaining the
    // source pistol pose's relaxed, downward-facing left hand.
    const leftWrist = actor.arms.left[2];
    actor.arms.right[2].getWorldQuaternion(armQuaternions[0]);
    armQuaternions[0].multiply(pitchRotation.setFromAxisAngle(UP, Math.PI));
    leftWrist.parent!.getWorldQuaternion(armQuaternions[1]).invert();
    leftWrist.quaternion.copy(armQuaternions[1].multiply(armQuaternions[0]));
  }
  actor.weapons.rifle.visible = weapon === 'rifle';
  actor.weapons.pistol.visible = weapon === 'pistol';
  actor.muzzle.position.set(0, weapon === 'rifle' ? 0.1 : 0.075, weapon === 'rifle' ? 0.68 : 0.19);
  actor.flash.visible = pose.shooting && !pose.reloading && Math.sin(actor.age * 65) > 0;
  actor.flash.scale.setScalar(0.8 + 0.3 * Math.sin(actor.age * 109));
  actor.animationState = pose.reloading ? 'reload' : pose.shooting ? 'fire' : running > 0.5 ? 'run' : walking > 0.2 ? 'walk' : 'idle';
}

/** Releases actor-local resources; shared template geometry remains cached. */
export function disposeActor(actor: Actor): void {
  actor.group.removeFromParent();
  actor.mixer.stopAllAction();
  actor.mixer.uncacheRoot(actor.model);
  const skeletons = new Set<THREE.Skeleton>();
  actor.model.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  skeletons.forEach((skeleton) => skeleton.dispose());
  actor.weaponMount.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  actor.materials.forEach((material) => material.dispose());
}
