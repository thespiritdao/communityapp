// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Hats Protocol interface
interface IHats {
    function isWearerOfHat(address _user, uint256 _hatId) external view returns (bool);
}

// SelfReceipt interface — proof a $SELF burn happened (minted by SelfPaymentV2.payWithSelf).
// EventManagerV2 validates + consumes a receipt instead of transferring $SELF (which is
// soulbound/non-transferable and can only be burned by its holder via payWithSelf).
interface ISelfReceipt {
    struct Receipt {
        address redeemer;
        string productId;
        uint256 hoursPaid;
        uint224 communityId;
        bool fulfilled;
    }
    function receipts(uint256 receiptId)
        external
        view
        returns (
            address redeemer,
            string memory productId,
            uint256 hoursPaid,
            uint224 communityId,
            uint64 redeemedAt,
            bool fulfilled
        );
    function markFulfilled(uint256 receiptId) external; // requires FULFILLER_ROLE
}

/**
 * @title EventManagerV2
 * @dev Event management with integrated payments and completion NFTs.
 *
 * WHAT CHANGED FROM V1 (soulbound $SELF cutover):
 *  - $SELF is now soulbound ERC-1155 — it cannot be transferred, only burned by its
 *    holder. So $SELF event tickets are paid OUT-OF-CONTRACT: the attendee's wallet
 *    calls SelfPaymentV2.payWithSelf (burns their $SELF, mints a SelfReceipt with
 *    productId == eventId). registerForEvent then VALIDATES + CONSUMES that receipt
 *    instead of doing selfToken.transferFrom (which would revert).
 *  - $SELF is NON-REFUNDABLE (burning is final). cancelEvent refunds $SYSTEM only.
 *  - $SELF is NOT routed to fundRecipient (burned $SELF has no recipient). $SYSTEM
 *    still escrows in this contract and routes to fundRecipient on completion.
 *  - $SYSTEM logic (escrow on register, route on complete, refund on cancel) is
 *    UNCHANGED from V1.
 *
 * EventManagerV2 must hold FULFILLER_ROLE on the SelfReceipt contract so it can
 * mark a ticket receipt consumed (single-use).
 */
contract EventManagerV2 is ERC721, ReentrancyGuard {

    enum EventStatus { Created, Active, Completed, Cancelled }

    struct Event {
        string eventId;
        string title;
        uint256 eventDate;
        address organizer;
        address fundRecipient;
        uint256 priceSystem;
        uint256 priceSelf; // in $SELF wei (1e18 = 1 hour); paid via burn, not transfer
        EventStatus status;
        uint256 createdAt;
        uint256 maxAttendees;
        uint256 currentAttendees;
        bool requiresPayment;
    }

    // Payment tracking. amountSelf is recorded for audit only — it is NOT held by this
    // contract (it was burned), so it is never refunded or routed.
    struct Payment {
        address attendee;
        uint256 amountSystem;
        uint256 amountSelf;
        uint256 selfReceiptId; // the consumed SelfReceipt, 0 if none
        uint256 timestamp;
        bool refunded;
    }

    struct CompletionCertificate {
        string eventId;
        address recipient;
        string metadataURI;
        uint256 mintedAt;
    }

    mapping(string => Event) public events;
    mapping(string => Payment[]) public eventPayments;
    mapping(string => address[]) public eventAttendees;
    mapping(address => string[]) public userEvents;
    mapping(uint256 => CompletionCertificate) public certificates;

    string[] public allEventIds;
    uint256 private _certificateCounter;

    IERC20 public systemToken;
    ISelfReceipt public selfReceipt;

    IHats public hatsContract;
    uint256 public eventManagementHatId;

    event EventCreated(
        string indexed eventId,
        address indexed organizer,
        string title,
        uint256 eventDate,
        uint256 priceSystem,
        uint256 priceSelf
    );

    event AttendeeRegistered(
        string indexed eventId,
        address indexed attendee,
        uint256 amountSystem,
        uint256 amountSelf,
        uint256 selfReceiptId,
        uint256 timestamp
    );

    event EventCompleted(
        string indexed eventId,
        address indexed organizer,
        uint256 totalSystem,
        uint256 timestamp
    );

    event CertificateMinted(
        string indexed eventId,
        address indexed recipient,
        uint256 indexed certificateId,
        string metadataURI
    );

    event EventCancelled(
        string indexed eventId,
        address indexed organizer,
        uint256 refundCount
    );

    constructor(
        address _hatsContract,
        uint256 _eventManagementHatId,
        address _systemToken,
        address _selfReceipt
    ) ERC721("DAO Event Certificates", "CERT") {
        require(_hatsContract != address(0), "Invalid Hats contract address");
        require(_selfReceipt != address(0), "Invalid SelfReceipt address");
        hatsContract = IHats(_hatsContract);
        eventManagementHatId = _eventManagementHatId;
        systemToken = IERC20(_systemToken);
        selfReceipt = ISelfReceipt(_selfReceipt);
    }

    modifier onlyEventManager() {
        require(
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
            "Must wear event management hat"
        );
        _;
    }

    /**
     * @dev Create a new event. Open to all users — permission checks at app level.
     */
    function createEvent(
        string memory eventId,
        string memory title,
        uint256 eventDate,
        address fundRecipient,
        uint256 priceSystem,
        uint256 priceSelf,
        uint256 maxAttendees
    ) external {
        require(bytes(eventId).length > 0, "Event ID required");
        require(bytes(events[eventId].eventId).length == 0, "Event exists");
        require(bytes(title).length > 0, "Title required");
        require(eventDate > block.timestamp, "Event must be in future");
        require(fundRecipient != address(0), "Invalid fund recipient");

        bool requiresPayment = (priceSystem > 0 || priceSelf > 0);

        events[eventId] = Event({
            eventId: eventId,
            title: title,
            eventDate: eventDate,
            organizer: msg.sender,
            fundRecipient: fundRecipient,
            priceSystem: priceSystem,
            priceSelf: priceSelf,
            status: EventStatus.Created,
            createdAt: block.timestamp,
            maxAttendees: maxAttendees,
            currentAttendees: 0,
            requiresPayment: requiresPayment
        });

        allEventIds.push(eventId);
        userEvents[msg.sender].push(eventId);

        emit EventCreated(eventId, msg.sender, title, eventDate, priceSystem, priceSelf);
    }

    /**
     * @dev Register for an event.
     * @param eventId        the event
     * @param selfReceiptId  for $SELF-priced events, the SelfReceipt minted when the
     *                       caller burned $SELF via SelfPaymentV2.payWithSelf for THIS
     *                       event. Pass 0 for $SYSTEM-only / free events.
     *
     * $SYSTEM is escrowed here (transferFrom). $SELF was already burned off-contract;
     * we verify the receipt (right redeemer, right event, enough hours, not yet used)
     * and consume it.
     */
    function registerForEvent(string memory eventId, uint256 selfReceiptId)
        external
        nonReentrant
    {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(eventData.status == EventStatus.Created, "Event not available");
        require(block.timestamp < eventData.eventDate, "Event has started");

        // Not already registered
        address[] memory attendees = eventAttendees[eventId];
        for (uint i = 0; i < attendees.length; i++) {
            require(attendees[i] != msg.sender, "Already registered");
        }

        // Capacity
        if (eventData.maxAttendees > 0) {
            require(eventData.currentAttendees < eventData.maxAttendees, "Event full");
        }

        uint256 consumedReceipt = 0;

        if (eventData.requiresPayment) {
            // --- $SYSTEM (ERC-20): escrow in this contract ---
            if (eventData.priceSystem > 0) {
                require(
                    systemToken.allowance(msg.sender, address(this)) >= eventData.priceSystem,
                    "Insufficient SYSTEM token allowance"
                );
                require(
                    systemToken.balanceOf(msg.sender) >= eventData.priceSystem,
                    "Insufficient SYSTEM token balance"
                );
                require(
                    systemToken.transferFrom(msg.sender, address(this), eventData.priceSystem),
                    "SYSTEM token transfer failed"
                );
            }

            // --- $SELF (soulbound): validate + consume the burn receipt ---
            if (eventData.priceSelf > 0) {
                require(selfReceiptId != 0, "SELF receipt required");
                (
                    address redeemer,
                    string memory productId,
                    uint256 hoursPaid,
                    ,
                    ,
                    bool fulfilled
                ) = selfReceipt.receipts(selfReceiptId);

                require(redeemer == msg.sender, "Receipt not yours");
                require(!fulfilled, "Receipt already used");
                require(
                    keccak256(bytes(productId)) == keccak256(bytes(eventId)),
                    "Receipt not for this event"
                );
                require(hoursPaid >= eventData.priceSelf, "Receipt underpays");

                // Consume the ticket (single-use). Requires FULFILLER_ROLE on SelfReceipt.
                selfReceipt.markFulfilled(selfReceiptId);
                consumedReceipt = selfReceiptId;
            }

            eventPayments[eventId].push(Payment({
                attendee: msg.sender,
                amountSystem: eventData.priceSystem,
                amountSelf: eventData.priceSelf,
                selfReceiptId: consumedReceipt,
                timestamp: block.timestamp,
                refunded: false
            }));
        }

        eventAttendees[eventId].push(msg.sender);
        eventData.currentAttendees++;
        userEvents[msg.sender].push(eventId);

        emit AttendeeRegistered(
            eventId,
            msg.sender,
            eventData.priceSystem,
            eventData.priceSelf,
            consumedReceipt,
            block.timestamp
        );
    }

    /**
     * @dev Complete event. Routes escrowed $SYSTEM to fundRecipient. $SELF was burned
     * at registration (not held here), so nothing to route for it.
     */
    function completeEvent(string memory eventId) external {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer ||
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Created, "Event not active");
        require(block.timestamp >= eventData.eventDate, "Event not started");

        eventData.status = EventStatus.Completed;

        uint256 totalSystemTokens = 0;
        Payment[] memory payments = eventPayments[eventId];
        for (uint i = 0; i < payments.length; i++) {
            if (!payments[i].refunded) {
                totalSystemTokens += payments[i].amountSystem;
            }
        }

        if (totalSystemTokens > 0) {
            require(
                systemToken.transfer(eventData.fundRecipient, totalSystemTokens),
                "SYSTEM token distribution failed"
            );
        }

        emit EventCompleted(eventId, eventData.organizer, totalSystemTokens, block.timestamp);
    }

    /**
     * @dev Cancel event and refund attendees. $SYSTEM is refunded; $SELF is NOT
     * (it was burned — refunding is impossible for soulbound tokens).
     */
    function cancelEvent(string memory eventId) external nonReentrant {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer ||
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Created, "Cannot cancel");

        eventData.status = EventStatus.Cancelled;

        Payment[] storage payments = eventPayments[eventId];
        uint256 refundCount = 0;

        for (uint i = 0; i < payments.length; i++) {
            if (!payments[i].refunded) {
                payments[i].refunded = true;

                // Refund $SYSTEM only. $SELF was burned and cannot be returned.
                if (payments[i].amountSystem > 0) {
                    require(
                        systemToken.transfer(payments[i].attendee, payments[i].amountSystem),
                        "SYSTEM token refund failed"
                    );
                }

                refundCount++;
            }
        }

        emit EventCancelled(eventId, eventData.organizer, refundCount);
    }

    /**
     * @dev Mint completion certificate to an attendee.
     */
    function mintCompletionCertificate(
        string memory eventId,
        address recipient,
        string memory metadataURI
    ) external returns (uint256) {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer ||
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Completed, "Event not completed");

        bool attended = false;
        address[] memory attendees = eventAttendees[eventId];
        for (uint i = 0; i < attendees.length; i++) {
            if (attendees[i] == recipient) {
                attended = true;
                break;
            }
        }
        require(attended, "Recipient did not attend");

        _certificateCounter++;
        uint256 certificateId = _certificateCounter;

        certificates[certificateId] = CompletionCertificate({
            eventId: eventId,
            recipient: recipient,
            metadataURI: metadataURI,
            mintedAt: block.timestamp
        });

        _mint(recipient, certificateId);

        emit CertificateMinted(eventId, recipient, certificateId, metadataURI);

        return certificateId;
    }

    /**
     * @dev Batch mint certificates to multiple attendees.
     */
    function batchMintCertificates(
        string memory eventId,
        address[] memory recipients,
        string[] memory metadataURIs
    ) external {
        require(recipients.length == metadataURIs.length, "Array length mismatch");

        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer ||
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Completed, "Event not completed");

        for (uint i = 0; i < recipients.length; i++) {
            bool attended = false;
            address[] memory attendees = eventAttendees[eventId];
            for (uint j = 0; j < attendees.length; j++) {
                if (attendees[j] == recipients[i]) {
                    attended = true;
                    break;
                }
            }
            require(attended, "Recipient did not attend");

            _certificateCounter++;
            uint256 certificateId = _certificateCounter;

            certificates[certificateId] = CompletionCertificate({
                eventId: eventId,
                recipient: recipients[i],
                metadataURI: metadataURIs[i],
                mintedAt: block.timestamp
            });

            _mint(recipients[i], certificateId);

            emit CertificateMinted(eventId, recipients[i], certificateId, metadataURIs[i]);
        }
    }

    // View functions
    function getEvent(string memory eventId) external view returns (Event memory) {
        require(bytes(events[eventId].eventId).length > 0, "Event not found");
        return events[eventId];
    }

    function getEventAttendees(string memory eventId) external view returns (address[] memory) {
        return eventAttendees[eventId];
    }

    function getUserEvents(address user) external view returns (string[] memory) {
        return userEvents[user];
    }

    function getAllEvents() external view returns (string[] memory) {
        return allEventIds;
    }

    function getEventPayments(string memory eventId) external view returns (Payment[] memory) {
        return eventPayments[eventId];
    }

    function isRegisteredForEvent(string memory eventId, address user)
        external
        view
        returns (bool)
    {
        address[] memory attendees = eventAttendees[eventId];
        for (uint i = 0; i < attendees.length; i++) {
            if (attendees[i] == user) return true;
        }
        return false;
    }
}
