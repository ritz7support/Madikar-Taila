{
  "version": "7.3",
  "data_api_version": "3.0",
  "routing_model": {
    "ADDRESS_LIST": [
      "ADDRESS_SELECTION",
      "NEW_ADDRESS"
    ],
    "ADDRESS_SELECTION": [
      "ADDRESS_DETAILS"
    ],
    "ADDRESS_DETAILS": [],
    "NEW_ADDRESS": [
      "ADDRESS_DETAILS"
    ]
  },
  "screens": [
    {
      "id": "ADDRESS_LIST",
      "title": "Choose delivery address",
      "data": {
        "address_options": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "main-content": {
                "type": "object",
                "properties": {
                  "title": { "type": "string" },
                  "description": { "type": "string" },
                  "metadata": { "type": "string" }
                }
              },
              "on-click-action": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "payload": { "type": "object" }
                }
              }
            }
          },
          "__example__": [
            {
              "id": "select_address",
              "main-content": {
                "title": "Select an address",
                "description": "Choose address"
              },
              "on-click-action": {
                "name": "data_exchange",
                "payload": { "user_action": "SELECT_ADDRESS" }
              }
            },
            {
              "id": "add_new_address",
              "main-content": {
                "title": "Add a new address",
                "description": "Create a new address"
              },
              "on-click-action": {
                "name": "navigate",
                "next": { "type": "screen", "name": "NEW_ADDRESS" },
                "payload": {}
              }
            }
          ]
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "NavigationList",
            "name": "address_options",
            "list-items": "${data.address_options}"
          }
        ]
      }
    },
    {
      "id": "ADDRESS_SELECTION",
      "title": "Select an address",
      "data": {
        "saved_addresses": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "main-content": {
                "type": "object",
                "properties": {
                  "title": { "type": "string" },
                  "description": { "type": "string" },
                  "metadata": { "type": "string" }
                }
              },
              "on-click-action": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "payload": { "type": "object" }
                }
              }
            }
          },
          "__example__": [
            {
              "id": "602086f9-871b-4ea0-b992-87fe27d6aa3b",
              "main-content": {
                "title": "Home",
                "description": "12 MG Road",
                "metadata": "Bengaluru, 560038"
              },
              "on-click-action": {
                "name": "data_exchange",
                "payload": { "selected_address_id": "602086f9-871b-4ea0-b992-87fe27d6aa3b" }
              }
            }
          ]
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "NavigationList",
            "name": "saved_addresses",
            "list-items": "${data.saved_addresses}"
          }
        ]
      }
    },
    {
      "id": "ADDRESS_DETAILS",
      "title": "Delivery address",
      "terminal": true,
      "success": true,
      "data": {
        "address_id": { "type": "string", "__example__": "602086f9-871b-4ea0-b992-87fe27d6aa3b" },
        "label": { "type": "string", "__example__": "Home" },
        "recipient_name": { "type": "string", "__example__": "John Doe" },
        "phone": { "type": "string", "__example__": "9876543210" },
        "address_line_1": { "type": "string", "__example__": "12 MG Road" },
        "address_line_2": { "type": "string", "__example__": "Apartment 4B" },
        "locality": { "type": "string", "__example__": "Indiranagar" },
        "city": { "type": "string", "__example__": "Bengaluru" },
        "state": { "type": "string", "__example__": "Karnataka" },
        "pincode": { "type": "string", "__example__": "560038" },
        "country": { "type": "string", "__example__": "India" }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "TextInput",
            "name": "label",
            "label": "Address name",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.label}",
            "helper-text": "For example, Home or Office"
          },
          {
            "type": "TextInput",
            "name": "recipient_name",
            "label": "Recipient name",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.recipient_name}",
            "helper-text": "Name of the person receiving the order"
          },
          {
            "type": "TextInput",
            "name": "phone",
            "label": "Phone number",
            "input-type": "phone",
            "enabled": false,
            "init-value": "${data.phone}",
            "helper-text": "Phone number for this delivery"
          },
          {
            "type": "TextInput",
            "name": "address_line_1",
            "label": "Address",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.address_line_1}",
            "helper-text": "House, flat, building or street"
          },
          {
            "type": "TextInput",
            "name": "address_line_2",
            "label": "Address line 2",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.address_line_2}",
            "helper-text": "Optional"
          },
          {
            "type": "TextInput",
            "name": "locality",
            "label": "Locality",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.locality}"
          },
          {
            "type": "TextInput",
            "name": "city",
            "label": "City",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.city}"
          },
          {
            "type": "TextInput",
            "name": "state",
            "label": "State",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.state}"
          },
          {
            "type": "TextInput",
            "name": "pincode",
            "label": "Pincode",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.pincode}",
            "helper-text": "6-digit pincode"
          },
          {
            "type": "TextInput",
            "name": "country",
            "label": "Country",
            "input-type": "text",
            "enabled": false,
            "init-value": "${data.country}"
          },
          {
            "type": "Footer",
            "label": "Use this address",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "address_id": "${data.address_id}",
                "address_label": "${data.label}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "NEW_ADDRESS",
      "title": "Add delivery address",
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "address_form",
            "children": [
              {
                "type": "TextInput",
                "name": "label",
                "label": "Address name",
                "input-type": "text",
                "required": true,
                "helper-text": "For example, Home or Office",
                "max-chars": 30
              },
              {
                "type": "TextInput",
                "name": "recipient_name",
                "label": "Recipient name",
                "input-type": "text",
                "required": true,
                "helper-text": "Name of the person receiving the order",
                "max-chars": 60
              },
              {
                "type": "TextInput",
                "name": "phone",
                "label": "Phone number",
                "input-type": "phone",
                "required": true,
                "helper-text": "Phone number for this delivery",
                "min-chars": 10,
                "max-chars": 15
              },
              {
                "type": "TextInput",
                "name": "address_line_1",
                "label": "Address",
                "input-type": "text",
                "required": true,
                "helper-text": "House, flat, building or street",
                "max-chars": 80
              },
              {
                "type": "TextInput",
                "name": "address_line_2",
                "label": "Address line 2",
                "input-type": "text",
                "required": false,
                "helper-text": "Optional",
                "max-chars": 80
              },
              {
                "type": "TextInput",
                "name": "locality",
                "label": "Locality",
                "input-type": "text",
                "required": true,
                "max-chars": 60
              },
              {
                "type": "TextInput",
                "name": "city",
                "label": "City",
                "input-type": "text",
                "required": true,
                "max-chars": 40
              },
              {
                "type": "TextInput",
                "name": "state",
                "label": "State",
                "input-type": "text",
                "required": true,
                "max-chars": 40
              },
              {
                "type": "TextInput",
                "name": "pincode",
                "label": "Pincode",
                "input-type": "text",
                "required": true,
                "pattern": "^[0-9]{6}$",
                "helper-text": "Enter your 6-digit pincode",
                "min-chars": 6,
                "max-chars": 6
              },
              {
                "type": "Footer",
                "label": "Save & use address",
                "on-click-action": {
                  "name": "data_exchange",
                  "payload": {
                    "action": "SAVE_ADDRESS",
                    "recipient_name": "${form.recipient_name}",
                    "phone": "${form.phone}",
                    "label": "${form.label}",
                    "address_line_1": "${form.address_line_1}",
                    "address_line_2": "${form.address_line_2}",
                    "locality": "${form.locality}",
                    "city": "${form.city}",
                    "state": "${form.state}",
                    "pincode": "${form.pincode}",
                    "country": "India"
                  }
                }
              }
            ]
          }
        ]
      }
    }
  ]
}