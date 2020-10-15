from http.server import HTTPServer, SimpleHTTPRequestHandler
import ssl

print("Configuring Server")
httpd = HTTPServer(('0.0.0.0', 4443), SimpleHTTPRequestHandler)

httpd.socket = ssl.wrap_socket (httpd.socket,
        keyfile="./star.pem",
        certfile='./star.pem', server_side=True)

print("Starting Server")
httpd.serve_forever()
print("Done")
