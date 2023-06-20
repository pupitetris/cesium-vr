from http.server import HTTPServer, SimpleHTTPRequestHandler
import ssl

#USE_HTTPS = False
USE_HTTPS = True

if USE_HTTPS:
    PORT = 4443
    # https://wiki.debian.org/Self-Signed_Certificate
    CERTFILE = './star.pem' # copy from /etc/ssl/certs/ssl-cert-snakeoil.pem for example.
    KEYFILE = './star.key' # copy from /etc/ssl/private/ssl-cert-snakeoil.key
else:
    PORT=8002

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='htdocs', **kwargs)

    def translate_path(self, path):
        if self.path.startswith('/src/'):
            return '.' + path;
        return super().translate_path(path);

print("Configuring Server")

httpd = HTTPServer(('0.0.0.0', PORT), Handler)
if USE_HTTPS:
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ssl_context.load_cert_chain(certfile=CERTFILE, keyfile=KEYFILE)
    httpd.socket = ssl_context.wrap_socket(httpd.socket, server_side=True)

print("Starting server at port " + str(PORT))
httpd.serve_forever()
print("Done")
