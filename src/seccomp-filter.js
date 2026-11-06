// Classic-BPF seccomp program for the local game sandbox. x86_64 syscall
// numbers only; any other architecture fails closed before a game can load.
const LD_W_ABS = 0x20,
  JEQ = 0x15,
  JGE = 0x35,
  JSET = 0x45,
  RET = 0x06;
const KILL_PROCESS = 0x80000000,
  ALLOW = 0x7fff0000,
  ERRNO = (n) => 0x00050000 | n;
const AUDIT_X86_64 = 0xc000003e,
  X32_BIT = 0x40000000;
const OFF_NR = 0,
  OFF_ARCH = 4,
  OFF_ARG0_LO = 16,
  OFF_ARG1_LO = 24;
const ENOSYS = [
  425, 426, 427, // io_uring: let libuv/glibc fall back
  435, // clone3
];
const EPERM = [
  272, 308, 165, 166, 155, 161, 428, 429, 430, 431, 432, 433, 442, // mounts, ns
  321, 298, 323, // bpf, perf_event_open, userfaultfd
  250, 248, 249, // keyctl, add_key, request_key
  101, 310, 311, 312, // ptrace, process_vm_*, kcmp
  135, 246, 320, 175, 313, 176, // personality, kexec, modules
  169, 167, 168, 103, 163, // reboot, swap, syslog, acct
  179, 443, 212, 134, 304, 303, 153, // quota, dcookie, uselib, handles, vhangup
  172, 173, // iopl, ioperm
  164, 227, 159, 305, 170, 171, // clock/hostname writes
  237, 256, 279, 238, 239, // NUMA policy
];
const CLONE_NEW_BITS = 0x7e020000, // NEWNS|NEWCGROUP|NEWUTS|NEWIPC|NEWUSER|NEWPID|NEWNET
  TIOCSTI = 0x5412,
  TIOCLINUX = 0x541c,
  AF_UNIX = 1;
export function buildSeccompFilter(arch = process.arch) {
  if (arch !== "x64")
    throw Error(
      "The local game sandbox seccomp filter supports x86_64 only.",
    );
  const p = [];
  // Audit architecture: anything but x86_64 kills the process (fails closed).
  p.push([LD_W_ABS, 0, 0, OFF_ARCH]);
  p.push([JEQ, 1, 0, AUDIT_X86_64]);
  p.push([RET, 0, 0, KILL_PROCESS]);
  // x32 ABI syscall numbers get ENOSYS.
  p.push([LD_W_ABS, 0, 0, OFF_NR]);
  p.push([JGE, 0, 1, X32_BIT]);
  p.push([RET, 0, 0, ERRNO(38)]);
  for (const nr of ENOSYS) {
    p.push([LD_W_ABS, 0, 0, OFF_NR]);
    p.push([JEQ, 0, 1, nr]);
    p.push([RET, 0, 0, ERRNO(38)]);
  }
  for (const nr of EPERM) {
    p.push([LD_W_ABS, 0, 0, OFF_NR]);
    p.push([JEQ, 0, 1, nr]);
    p.push([RET, 0, 0, ERRNO(1)]);
  }
  // clone(2): deny any namespace-creation flag, allow the rest (threads ok).
  p.push([LD_W_ABS, 0, 0, OFF_NR]);
  p.push([JEQ, 0, 3, 56]);
  p.push([LD_W_ABS, 0, 0, OFF_ARG0_LO]);
  p.push([JSET, 0, 1, CLONE_NEW_BITS]);
  p.push([RET, 0, 0, ERRNO(1)]);
  // ioctl(2): deny TIOCSTI/TIOCLINUX terminal injection, allow the rest.
  p.push([LD_W_ABS, 0, 0, OFF_NR]);
  p.push([JEQ, 0, 4, 16]);
  p.push([LD_W_ABS, 0, 0, OFF_ARG1_LO]);
  p.push([JEQ, 1, 0, TIOCSTI]);
  p.push([JEQ, 0, 1, TIOCLINUX]);
  p.push([RET, 0, 0, ERRNO(1)]);
  // socket(2): AF_UNIX only; every other family gets EAFNOSUPPORT.
  p.push([LD_W_ABS, 0, 0, OFF_NR]);
  p.push([JEQ, 0, 4, 41]);
  p.push([LD_W_ABS, 0, 0, OFF_ARG0_LO]);
  p.push([JEQ, 1, 0, AF_UNIX]);
  p.push([RET, 0, 0, ERRNO(97)]);
  p.push([RET, 0, 0, ALLOW]);
  // Default allow.
  p.push([RET, 0, 0, ALLOW]);
  const buffer = Buffer.alloc(p.length * 8);
  p.forEach(([code, jt, jf, k], i) => {
    buffer.writeUInt16LE(code, i * 8);
    buffer.writeUInt8(jt, i * 8 + 2);
    buffer.writeUInt8(jf, i * 8 + 3);
    buffer.writeUInt32LE(k >>> 0, i * 8 + 4);
  });
  return buffer;
}
