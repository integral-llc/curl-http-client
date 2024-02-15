# curl-http-client

This is a simple HTTP client that uses the `curl` command to make HTTP requests. 
It is a simple wrapper around the `curl` command that allows you to make 
HTTP requests from the command line.

## Why not Axios?

Axios is good, and I'd happily be using it, but there are situations when
the project runs inside a Docker container and due to miss configuration
with SSL certificates, Axios fails to make requests. This is a simple
alternative to make requests using the `curl` command.
