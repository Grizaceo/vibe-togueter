// Protocol translation only. External game source remains in its own repository.
use std::io::{self, BufRead, Write};
use shared::proto::ServerMsg;

fn decode(hex: &str) -> Result<serde_json::Value, String> {
    if hex.len() > 2 * 1048576 || hex.len() % 2 != 0 { return Err("frame size".into()); }
    let bytes: Vec<u8> = (0..hex.len()).step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i+2], 16).map_err(|_| "hex".to_string()))
        .collect::<Result<_, _>>()?;
    let (message, rest) = postcard::take_from_bytes::<ServerMsg>(&bytes)
        .map_err(|_| "incompatible postcard schema")?;
    if !rest.is_empty() { return Err("unexpected protocol fields".into()); }
    Ok(match message {
        ServerMsg::Welcome { player_id, server_tick, tickrate, mode, map, jump } => {
            if tickrate != 50 || mode > 7 || map.as_ref().is_some_and(|m| m.w == 0 || m.h == 0 || m.w > 512 || m.h > 512 || m.tiles.len() != (m.w*m.h) as usize) {
                return Err("unsupported welcome".into());
            }
            serde_json::json!({"type":"welcome", "playerId":player_id, "tick":server_tick, "tickrate":tickrate, "mode":mode, "jump":jump})
        },
        ServerMsg::Snapshot { tick, players, last_input_seq, .. } => {
            if players.len() > 256 { return Err("player limit".into()); }
            let mut out = Vec::new();
            for p in players {
                if ![p.pos.x,p.pos.y,p.vel.x,p.vel.y].iter().all(|v| v.is_finite()) || p.name.len() > 128 {
                    return Err("invalid player".into());
                }
                out.push(serde_json::json!({"id":p.id,"name":p.name,"position":p.pos,"alive":p.alive,"score":p.score}));
            }
            serde_json::json!({"type":"snapshot","tick":tick,"players":out,"ack":last_input_seq})
        },
        ServerMsg::Pong { client_time, server_tick } => serde_json::json!({"type":"pong","clientTime":client_time,"tick":server_tick}),
        // Decode every event through the pinned enum; unknown tags/fields fail above.
        ServerMsg::Events { tick, events } => {
            if events.len() > 4096 { return Err("event limit".into()); }
            serde_json::json!({"type":"events","tick":tick,"count":events.len()})
        },
        _ => return Err("unsupported server message".into()),
    })
}
fn main() {
    println!("{}", serde_json::json!({"version":1,"schema":"teeworlds-rs/172cfef","capabilities":["collective-tee","bounded-input","authoritative-position"]}));
    io::stdout().flush().unwrap();
    for line in io::stdin().lock().lines() {
        let response = line.map_err(|_| "stdin".to_string())
            .and_then(|s| {
                if !s.is_ascii() { return Err("ascii required".into()); }
                decode(&s)
            });
        println!("{}", match response { Ok(v) => serde_json::json!({"ok":v}), Err(e) => serde_json::json!({"error":e}) });
        io::stdout().flush().unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn hex(b: &[u8]) -> String { b.iter().map(|v| format!("{v:02x}")).collect() }
    #[test]
    fn pinned_rust_welcome_is_consumed_exactly() {
        let msg=ServerMsg::Welcome { player_id:7,server_tick:10,tickrate:50,mode:0,map:None,jump:shared::JumpCfg::default() };
        let mut bytes=shared::proto::encode_server(&msg);
        assert_eq!(decode(&hex(&bytes)).unwrap()["playerId"],7);
        bytes.push(0); assert!(decode(&hex(&bytes)).is_err());
        bytes.truncate(3); assert!(decode(&hex(&bytes)).is_err());
    }
    #[test]
    fn unknown_variants_and_wrong_modes_are_rejected() {
        assert!(decode("63").is_err());
        let msg=ServerMsg::Welcome { player_id:7,server_tick:10,tickrate:50,mode:255,map:None,jump:shared::JumpCfg::default() };
        assert!(decode(&hex(&shared::proto::encode_server(&msg))).is_err());
        assert!(decode("zz").is_err());
    }
    #[test]
    fn advanced_input_golden_matches_rust() {
        let input=shared::input::Input {dir:-1,jump:true,fire:true,aim:shared::Vec2::new(-1.0,0.0),weapon:2,..Default::default()};
        let msg=shared::proto::ClientMsg::Input{seq:300,input};
        assert_eq!(hex(&shared::proto::encode_client(&msg)),"01ac02ff010001000080bf0000000002000000");
    }
}
