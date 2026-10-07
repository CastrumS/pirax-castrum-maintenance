import os, re, socket, subprocess, sys, time
pid = int(sys.argv[1])
opened = 0
until = time.monotonic() + 15
while time.monotonic() < until:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        break
    listing = subprocess.check_output(['ss', '-H', '-ltnp'], text=True)
    for line in listing.splitlines():
        if not re.search(r'pid=' + str(pid) + r'\b', line):
            continue
        address = line.split()[3]
        if not address.startswith('127.0.0.1:'):
            continue
        try:
            with socket.create_connection(('127.0.0.1', int(address.rsplit(':',1)[1])), timeout=0.05):
                opened += 1
        except OSError:
            pass
    time.sleep(0.04)
print('Unrelated real loopback connections opened:', opened)
