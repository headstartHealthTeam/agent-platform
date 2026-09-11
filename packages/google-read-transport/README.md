# Google Read Transport

Shared authenticated JSON transport for the bounded Google read adapters. Tokens remain inside
the transport, redirects are rejected, request timeouts are bounded, and errors expose status
codes without credential-bearing response bodies. The supervised ADC binding never starts OAuth.
An operator's configured recovery procedure owns authentication.

The public interface accepts an injected token provider so managed identities can replace local
ADC without changing an engine. See the [documentation hub](../../docs/README.md).
