## Local IP Locking
`listPublicIpAddresses` then `enableStaticNat` is a check-then-act race. CloudStack might not reject a duplicate claim, so two concurrent local runs can land on the same "Free" IP and both report success while only one VM is actually reachable through it. 

[`src/ipLock.ts`](src/ipLock.ts) is handling that issue with local lock file per IP, scoped to this machine. Locked IP will become stale lock (owning process no longer alive, or older than 15 minutes) can be reclaimed automatically so a killed run doesn't permanently hold the IP lock forever.

`publicIp` and `staticNat` only exist when `--publicIp=true` flag is used.